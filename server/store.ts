import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';

export class Store {
  db: DatabaseSync;
  constructor(file?: string) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file || join(config.dataDir, 'sole.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL,
        payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, PRIMARY KEY(collection,id));
      CREATE INDEX IF NOT EXISTS records_owner ON records(collection,owner);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  get<T>(collection: string, id: string, owner?: string): T | null {
    const row = (
      owner
        ? this.db
            .prepare('SELECT payload FROM records WHERE collection=? AND id=? AND owner=?')
            .get(collection, id, owner)
        : this.db
            .prepare('SELECT payload FROM records WHERE collection=? AND id=?')
            .get(collection, id)
    ) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) : null;
  }
  list<T>(collection: string, owner?: string): T[] {
    const rows = (
      owner
        ? this.db
            .prepare(
              'SELECT payload FROM records WHERE collection=? AND owner=? ORDER BY updated_at DESC',
            )
            .all(collection, owner)
        : this.db
            .prepare('SELECT payload FROM records WHERE collection=? ORDER BY updated_at DESC')
            .all(collection)
    ) as { payload: string }[];
    return rows.map((x) => JSON.parse(x.payload));
  }
  put(collection: string, id: string, owner: string, value: unknown, version = 1) {
    this.db
      .prepare(
        'INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at WHERE records.owner=excluded.owner',
      )
      .run(collection, id, owner, JSON.stringify(value), version, new Date().toISOString());
  }
  compareAndSet(
    collection: string,
    id: string,
    owner: string,
    expected: number,
    value: unknown,
  ): boolean {
    return (
      this.db
        .prepare(
          'UPDATE records SET payload=?, version=?, updated_at=? WHERE collection=? AND id=? AND owner=? AND version=?',
        )
        .run(
          JSON.stringify(value),
          expected + 1,
          new Date().toISOString(),
          collection,
          id,
          owner,
          expected,
        ).changes === 1
    );
  }
  remove(collection: string, id: string, owner: string) {
    this.db
      .prepare('DELETE FROM records WHERE collection=? AND id=? AND owner=?')
      .run(collection, id, owner);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
export const store = new Store();
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
