import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { store } from './store.ts';
import { config } from './config.ts';

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'REQUEST_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function privateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes(':')) return !ip.startsWith('2') && !ip.startsWith('3'); // Public global-unicast IPv6 only; excludes mapped IPv4.
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !['80', '443'].includes(url.port)) ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      !host.includes('.') ||
      (isIP(host) && privateAddress(host))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export async function publicUrl(value: string): Promise<string> {
  const url = safeUrl(value);
  if (!url) throw new AppError(400, 'Use a public HTTP or HTTPS URL.', 'INVALID_URL');
  const addresses = await lookup(new URL(url).hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((x) => privateAddress(x.address)))
    throw new AppError(
      400,
      'The source URL must resolve to a public network address.',
      'INVALID_URL',
    );
  return url;
}
export function session(req: IncomingMessage, res: ServerResponse): string {
  const cookies = req.headers.cookie || '';
  const raw = cookies.match(/(?:^|;\s*)sole_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const hash = raw ? createHash('sha256').update(raw).digest('hex') : null;
  if (hash) {
    const row = store.db.prepare('SELECT expires_at FROM sessions WHERE hash=?').get(hash) as
      { expires_at: number } | undefined;
    if (row && row.expires_at > Date.now()) return hash;
  }
  const token = randomBytes(32).toString('hex');
  const next = createHash('sha256').update(token).digest('hex');
  store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(next, Date.now() + 90 * 86400000);
  res.setHeader(
    'Set-Cookie',
    `sole_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7776000${config.production ? '; Secure' : ''}`,
  );
  return next;
}
export function checkOrigin(req: IncomingMessage) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) return;
  const origin = req.headers.origin;
  const allowed = config.publicUrl
    ? new URL(config.publicUrl).origin
    : `http://${req.headers.host}`;
  if (origin && origin !== allowed)
    throw new AppError(403, 'This request came from a different site.');
  if (req.headers['sec-fetch-site'] === 'cross-site')
    throw new AppError(403, 'Cross-site requests are not allowed.');
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new AppError(415, 'Send JSON for this request.');
}
export async function body(req: IncomingMessage, maxBytes = 100000): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new AppError(413, 'This request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    throw new AppError(400, 'The request body is not valid JSON.');
  }
}
