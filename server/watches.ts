import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.ts';
import { tinyfish } from './tinyfish.ts';
import { id, now, store } from './store.ts';
import { AppError, publicUrl, safeUrl } from './security.ts';
import type { TripWatch, TripChange } from '../src/lib/research.ts';
import type { TripRecord } from './jobs.ts';
import type { z } from 'zod';
import type { watchSchema } from './schemas.ts';

export type WatchRecord = {
  watch: TripWatch;
  owner: string;
  providerId?: string;
  tokenHash: string;
  snapshotHash?: string;
  seenUrls: string[];
  seenRuns: string[];
  nextCheckAt: number;
  createAttempted?: boolean;
  providerPaused?: boolean;
};
export const webhookEnabled = () =>
  Boolean(config.publicUrl && config.publicUrl.startsWith('https://'));
export function publicWatch(record: WatchRecord): TripWatch {
  return record.watch;
}
function save(record: WatchRecord) {
  store.put('watches', record.watch.id, record.owner, record);
}
const activeOperations = new Set<string>();
function snapshot(run: Record<string, unknown>) {
  const raw = Array.isArray(run.results) ? run.results : [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      url: typeof x.url === 'string' ? safeUrl(x.url) || '' : '',
      title: typeof x.title === 'string' ? x.title : '',
      text: typeof x.text === 'string' ? x.text : typeof x.snippet === 'string' ? x.snippet : '',
    }));
}
export function ingest(record: WatchRecord, run: Record<string, unknown>, baseline = false) {
  const runId =
    typeof run.id === 'string'
      ? run.id
      : createHash('sha256').update(JSON.stringify(run)).digest('hex');
  if (record.seenRuns.includes(runId)) return;
  const results = snapshot(run);
  if (Array.isArray(run.errors) && run.errors.length && !results.length) {
    record.watch.lastError = 'The source could not be read on the last check.';
    record.watch.lastCheckedAt = now();
    save(record);
    return;
  }
  const hash = createHash('sha256').update(JSON.stringify(results)).digest('hex');
  record.watch.lastCheckedAt = now();
  record.watch.lastError = undefined;
  const judgment =
    run.judgment && typeof run.judgment === 'object'
      ? (run.judgment as Record<string, unknown>)
      : null;
  const base =
    baseline || run.is_baseline === true || run.outcome === 'baseline' || !record.snapshotHash;
  const newResults = results.filter((x) => x.url && !record.seenUrls.includes(x.url));
  const changed =
    record.watch.type === 'search'
      ? newResults.length > 0
      : record.snapshotHash !== hash && run.outcome !== 'unchanged';
  if (base || changed) {
    const relevance = base
      ? false
      : judgment?.is_relevant === false
        ? false
        : judgment?.is_relevant === true
          ? true
          : null;
    if (base || relevance !== false) {
      const summary = base
        ? 'Baseline captured. Future checks will be compared with this source snapshot.'
        : typeof judgment?.summary === 'string'
          ? judgment.summary.slice(0, 700)
          : record.watch.type === 'search'
            ? `${newResults.length} new source link(s) found. Review their relevance to your destination and dates.`
            : 'The watched page changed. Review the source before changing any trip plans.';
      const change: TripChange = {
        id: runId,
        detectedAt: now(),
        summary,
        sourceUrl:
          record.watch.type === 'fetch'
            ? record.watch.target
            : newResults[0]?.url || results[0]?.url || '',
        relevant: relevance,
        disposition: 'new',
        baseline: base,
      };
      record.watch.changes = [change, ...record.watch.changes].slice(0, 100);
    }
  }
  record.snapshotHash = hash;
  record.seenUrls = [...new Set([...record.seenUrls, ...results.map((x) => x.url)])].slice(-500);
  record.seenRuns = [...record.seenRuns, runId].slice(-500);
  save(record);
}
export async function createWatch(
  owner: string,
  tripId: string,
  input: z.infer<typeof watchSchema>,
): Promise<TripWatch> {
  if (!config.monitoringEnabled)
    throw new AppError(503, 'Trip watching is disabled on this server.');
  const trip = store.get<TripRecord>('trips', tripId, owner);
  if (!trip) throw new AppError(404, 'Trip not found.');
  const expiry = Date.parse(input.expiresAt);
  if (expiry <= Date.now() || expiry > Date.now() + 90 * 86400000)
    throw new AppError(400, 'Choose an expiration within the next 90 days.');
  if (
    trip.trip.input.dateMode === 'exact' &&
    expiry > Date.parse(trip.trip.input.endDate + 'T23:59:59Z')
  )
    throw new AppError(400, 'Watching must end no later than the end of your trip.');
  if (
    store
      .list<WatchRecord>('watches', owner)
      .filter((r) => r.watch.tripId === tripId && ['active', 'creating'].includes(r.watch.status))
      .length >= 3
  )
    throw new AppError(409, 'You can watch up to three sources per trip. Pause or stop one first.');
  const target = input.type === 'fetch' ? await publicUrl(input.target) : input.target;
  if (input.type === 'fetch' && !trip.trip.research?.evidence.some((e) => e.url === target))
    throw new AppError(400, 'Select a source from this trip’s research.');
  if (
    input.type === 'search' &&
    !target.toLowerCase().includes(trip.trip.input.destination.split(',')[0].toLowerCase())
  )
    throw new AppError(400, 'The watched topic must include this trip’s destination.');
  const duplicate = store
    .list<WatchRecord>('watches', owner)
    .find(
      (r) =>
        r.watch.tripId === tripId &&
        r.watch.target === target &&
        (!['stopped', 'failed'].includes(r.watch.status) || (r.createAttempted && !r.providerId)),
    );
  if (duplicate) return duplicate.watch;
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const record: WatchRecord = {
    owner,
    tokenHash,
    seenUrls: [],
    seenRuns: [],
    nextCheckAt: Date.now() + (input.frequency === 'daily' ? 86400000 : 21600000),
    watch: {
      id: id(),
      tripId,
      status: 'creating',
      type: input.type,
      target,
      frequency: input.frequency,
      expiresAt: input.expiresAt,
      createdAt: now(),
      delivery: webhookEnabled() ? 'webhook' : 'server',
      changes: [],
    },
  };
  save(record);
  store.put('webhooks', tokenHash, owner, { watchId: record.watch.id, owner });
  try {
    record.createAttempted = true;
    save(record);
    const result = await tinyfish.createMonitor({
      type: input.type,
      name: `Sole ${trip.trip.input.destination.slice(0, 50)} · ${record.watch.id}`,
      config:
        input.type === 'fetch'
          ? { url: target, format: 'markdown' }
          : {
              query: target,
              recency_minutes: input.frequency === 'daily' ? 1440 : 360,
              result_limit: 5,
            },
      schedule_cron: input.frequency === 'daily' ? '0 9 * * *' : '0 */6 * * *',
      purpose: `Only meaningful changes for a trip to ${trip.trip.input.destination} ${trip.trip.input.dateMode === 'exact' ? `from ${trip.trip.input.startDate} through ${trip.trip.input.endDate}` : 'with flexible dates'}: closures, event cancellations, new matching events, or access changes. Ignore cosmetic changes. Do not claim inventory availability from a generic page.`,
      ...(webhookEnabled()
        ? { webhook_url: `${config.publicUrl.replace(/\/$/, '')}/api/webhooks/monitors/${token}` }
        : {}),
    });
    record.providerId = result.monitor.id;
    save(record);
    if (!webhookEnabled()) {
      await tinyfish.monitorAction(record.providerId, 'pause');
      record.providerPaused = true;
    }
    record.watch.status = 'active';
    ingest(record, result.run, true);
    return record.watch;
  } catch (error) {
    record.watch.status = 'failed';
    record.watch.lastError =
      error instanceof AppError
        ? error.message
        : 'Monitor creation was interrupted. No automatic duplicate monitor will be created.';
    save(record);
    throw error;
  }
}
export async function watchAction(
  record: WatchRecord,
  action: 'pause' | 'resume' | 'stop' | 'run',
): Promise<TripWatch> {
  if (!record.providerId) throw new AppError(409, 'This watch has no confirmed provider monitor.');
  if (activeOperations.has(record.watch.id))
    throw new AppError(409, 'A check is already in progress.');
  if (['resume', 'run'].includes(action) && Date.parse(record.watch.expiresAt) <= Date.now())
    throw new AppError(409, 'This watch has expired. Create a new watch with new dates.');
  if (record.watch.status === 'stopped')
    throw new AppError(409, 'This watch has stopped. Create a new watch to begin again.');
  activeOperations.add(record.watch.id);
  try {
    if (action === 'run') {
      const result = (await tinyfish.monitorAction(record.providerId, 'run')) as {
        run: Record<string, unknown>;
      };
      ingest(record, result.run);
    } else {
      // Stop pauses the provider and preserves the in-app history instead of deleting unrelated data.
      await tinyfish.monitorAction(
        record.providerId,
        action === 'resume' && record.watch.delivery === 'webhook' ? 'resume' : 'pause',
      );
      record.providerPaused = action !== 'resume' || record.watch.delivery === 'server';
      record.watch.status =
        action === 'resume' ? 'active' : action === 'stop' ? 'stopped' : 'paused';
      record.nextCheckAt = Date.now() + (record.watch.frequency === 'daily' ? 86400000 : 21600000);
      save(record);
    }
    return record.watch;
  } finally {
    activeOperations.delete(record.watch.id);
  }
}
export async function maintenance() {
  for (const record of store
    .list<WatchRecord>('watches')
    .filter(
      (r) => r.createAttempted && !r.providerId && ['creating', 'failed'].includes(r.watch.status),
    )) {
    try {
      const remote = await tinyfish.request<{ monitors: { id: string; name?: string }[] }>(
        'https://agent.tinyfish.ai/v1/monitors',
      );
      const match = remote.monitors.find((m) => m.name?.includes(record.watch.id));
      if (match) {
        record.providerId = match.id;
        await tinyfish.monitorAction(match.id, 'pause');
        record.providerPaused = true;
        record.watch.status = 'paused';
        record.watch.lastError =
          'Recovered an interrupted creation and paused the provider. Resume this watch when ready; the next check will establish its baseline.';
        save(record);
      }
    } catch {
      /* A failed lookup must never start a duplicate monitor. */
    }
  }
  for (const record of store.list<WatchRecord>('watches')) {
    if (!record.providerId) continue;
    if (Date.parse(record.watch.expiresAt) <= Date.now() && record.watch.status !== 'stopped') {
      try {
        await tinyfish.monitorAction(record.providerId, 'pause');
        record.watch.status = 'stopped';
        record.providerPaused = true;
        record.watch.lastError = undefined;
        save(record);
      } catch {
        record.watch.lastError =
          'Could not confirm provider pause at expiration. The server will retry.';
        save(record);
      }
      continue;
    }
    if (
      record.watch.status === 'active' &&
      record.watch.delivery === 'server' &&
      record.nextCheckAt <= Date.now() &&
      !activeOperations.has(record.watch.id)
    ) {
      record.nextCheckAt = Date.now() + (record.watch.frequency === 'daily' ? 86400000 : 21600000);
      save(record);
      try {
        await watchAction(record, 'run');
      } catch (error) {
        record.watch.lastError =
          error instanceof AppError ? error.message : 'The scheduled check could not finish.';
        save(record);
      }
    }
    // Recover a local monitor that was created before its provider pause was acknowledged.
    if (
      record.watch.delivery === 'server' &&
      !record.providerPaused &&
      record.watch.status !== 'active'
    ) {
      try {
        await tinyfish.monitorAction(record.providerId, 'pause');
        record.providerPaused = true;
        save(record);
      } catch {
        /* Retry on the next maintenance tick. */
      }
    }
  }
  const cutoff = Date.now();
  for (const record of store.list<TripRecord>('trips'))
    if (
      !record.saved &&
      record.expiresAt < cutoff &&
      !store
        .list<WatchRecord>('watches', record.owner)
        .some((w) => w.watch.tripId === record.trip.id && w.watch.status === 'active')
    ) {
      const job = record.trip.research?.jobId
        ? store.get<{ status: string }>('jobs', record.trip.research.jobId)
        : null;
      if (job && ['queued', 'running'].includes(job.status)) continue;
      store.remove('trips', record.trip.id, record.owner);
      if (record.trip.research?.jobId)
        store.remove('jobs', record.trip.research.jobId, record.owner);
    }
  for (const job of store.list<{
    id: string;
    owner: string;
    status: string;
    browserSessionId?: string | null;
  }>('jobs'))
    if (job.browserSessionId && ['done', 'failed', 'cancelled'].includes(job.status)) {
      try {
        await tinyfish.closeBrowser(job.browserSessionId);
        job.browserSessionId = null;
        store.put('jobs', job.id, job.owner, job);
      } catch {
        /* Retry orphan cleanup on the next maintenance tick. */
      }
    }
}
