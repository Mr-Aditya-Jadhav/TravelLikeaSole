import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { body, checkOrigin, session, AppError } from './security.ts';
import { config } from './config.ts';
import { store } from './store.ts';
import { createTrip, cancelJob, interpret, type ResearchJob, type TripRecord } from './jobs.ts';
import { createTripSchema, editSchema, styleSchema, watchSchema } from './schemas.ts';
import { validateInput } from '../src/lib/planner.ts';
import { replaceItem, schedule } from './planning.ts';
import { rankCandidates, BEAM_WIDTH, RANKING_VERSION } from './ranking.ts';
import {
  createWatch,
  ingest,
  publicWatch,
  watchAction,
  webhookEnabled,
  type WatchRecord,
} from './watches.ts';

const rate = new Map<string, { count: number; until: number }>();
function limit(owner: string, operation: string, max: number, windowMs: number) {
  const key = owner + operation;
  const previous = rate.get(key);
  const row =
    previous && previous.until > Date.now() ? previous : { count: 0, until: Date.now() + windowMs };
  row.count++;
  rate.set(key, row);
  if (row.count > max)
    throw new AppError(429, 'Too many requests. Please wait before starting more research.');
  if (rate.size > 10000) for (const [k, v] of rate) if (v.until < Date.now()) rate.delete(k);
}
export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}
const getTrip = (id: string, owner: string) => {
  const record = store.get<TripRecord>('trips', id, owner);
  if (!record) throw new AppError(404, 'This trip was not found in your session.');
  return record;
};
export async function api(req: IncomingMessage, res: ServerResponse) {
  try {
    const path = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
    const webhook = path.match(/^\/api\/webhooks\/monitors\/([a-f0-9]{64})$/);
    if (webhook && req.method === 'POST') {
      const hash = createHash('sha256').update(webhook[1]).digest('hex');
      const mapping = store.get<{ watchId: string; owner: string }>('webhooks', hash);
      if (!mapping) throw new AppError(404, 'Webhook not found.');
      const record = store.get<WatchRecord>('watches', mapping.watchId, mapping.owner);
      if (!record) throw new AppError(404, 'Webhook not found.');
      const payload = z.record(z.string(), z.unknown()).parse(await body(req, 5000000));
      const monitorId = payload.fetch_monitor_id || payload.search_monitor_id;
      if (monitorId !== record.providerId)
        throw new AppError(403, 'The monitor does not match this webhook.');
      if (record.watch.status === 'active' && Date.parse(record.watch.expiresAt) > Date.now())
        ingest(record, payload);
      return json(res, 200, { received: true });
    }
    checkOrigin(req);
    const owner = session(req, res);
    if (path === '/api/status' && req.method === 'GET')
      return json(res, 200, {
        configured: !!config.apiKey,
        mode: config.production ? 'production' : 'development',
        monitoringDelivery: webhookEnabled() ? 'webhook' : 'server',
        capabilities: [
          'Search',
          'Fetch',
          'Browser',
          'Agent',
          ...(config.monitoringEnabled ? ['Monitor'] : []),
        ],
      });
    if (path === '/api/profiles/interpret' && req.method === 'POST') {
      limit(owner, 'profiles', 60, 60000);
      const style = styleSchema.parse(await body(req));
      return json(res, 200, interpret(style, owner));
    }
    if (path === '/api/trips' && req.method === 'GET')
      return json(res, 200, {
        trips: store
          .list<TripRecord>('trips', owner)
          .filter((r) => r.saved)
          .map((r) => ({ ...r.trip, saved: true })),
      });
    if (path === '/api/trips' && req.method === 'POST') {
      if (!config.apiKey)
        throw new AppError(
          503,
          'Set TINYFISH_API_KEY on the server before planning a trip.',
          'NOT_CONFIGURED',
        );
      const parsed = createTripSchema.parse(await body(req));
      const issue = validateInput(parsed.input);
      if (issue) throw new AppError(400, issue);
      if (!store.get('requests', owner + parsed.requestId, owner)) {
        limit(owner, 'create-trip', 8, 3600000);
        limit(req.socket.remoteAddress || 'unknown-ip', 'create-trip-ip', 20, 3600000);
        limit('server', 'create-trip-global', 50, 3600000);
      }
      return json(res, 202, {
        trip: createTrip(parsed.input, parsed.style, owner, parsed.requestId),
      });
    }
    const match = path.match(/^\/api\/trips\/([a-f0-9-]{36})(?:\/(research|cancel|watches))?$/);
    if (match) {
      const record = getTrip(match[1], owner);
      const trip = record.trip;
      trip.saved = record.saved;
      if (!match[2] && req.method === 'GET') return json(res, 200, { trip });
      if (!match[2] && req.method === 'DELETE') {
        if (
          store
            .list<WatchRecord>('watches', owner)
            .some(
              (w) => w.watch.tripId === trip.id && ['active', 'creating'].includes(w.watch.status),
            )
        )
          throw new AppError(409, 'Stop active watches before deleting this trip.');
        const job = trip.research?.jobId
          ? store.get<ResearchJob>('jobs', trip.research.jobId, owner)
          : null;
        if (job && ['running', 'queued'].includes(job.status)) await cancelJob(job);
        store.remove('trips', trip.id, owner);
        return json(res, 200, { deleted: true });
      }
      if (!match[2] && req.method === 'PATCH') {
        const edit = editSchema.parse(await body(req));
        if (edit.version !== trip.version)
          throw new AppError(
            409,
            'This trip has a newer version. Refresh it before editing.',
            'STALE_VERSION',
          );
        if (edit.action === 'save') {
          record.saved = true;
          trip.saved = true;
          store.put('trips', trip.id, owner, record, trip.version);
          return json(res, 200, { trip });
        }
        if (['queued', 'researching', 'validating'].includes(trip.research?.status || ''))
          throw new AppError(409, 'Wait for research to finish before editing activities.');
        if (edit.action !== 'optimize' && !trip.days[edit.day])
          throw new AppError(404, 'That day was not found.');
        let next = structuredClone(trip);
        if (edit.action === 'optimize') {
          if (!trip.research?.candidates.length)
            throw new AppError(409, 'Research this trip before improving its recommendations.');
          const candidates = rankCandidates(trip.research.candidates, trip, trip.research.evidence);
          next = schedule(trip, candidates, trip.research.evidence);
          next.version = trip.version + 1;
          const referenced = new Set(next.days.flat().map((item) => item.candidateId));
          const retained = trip.research.candidates.filter(
            (candidate) =>
              referenced.has(candidate.id) &&
              !candidates.some((ranked) => ranked.id === candidate.id),
          );
          next.research = {
            ...trip.research,
            candidates: [...candidates, ...retained],
            ranking: {
              version: RANKING_VERSION,
              method: 'BM25 relevance, weighted fit, MMR diversity, bounded beam search',
              beamWidth: BEAM_WIDTH,
              rankedAt: new Date().toISOString(),
            },
          };
        }
        if (edit.action === 'lock') {
          const item = next.days[edit.day].find((x) => x.id === edit.itemId);
          if (!item) throw new AppError(404, 'That activity was not found.');
          item.locked = edit.locked;
          next.version++;
        }
        if (edit.action === 'quiet') {
          next.days[edit.day] = next.days[edit.day].filter(
            (x) => x.locked || x.type === 'rest' || x.time < '15:00',
          );
          next.version++;
        }
        if (edit.action === 'swap') {
          const replacement = replaceItem(trip, edit.day, edit.itemId);
          if (!replacement)
            throw new AppError(
              409,
              'No unused researched alternative fits this time and your requirements. Your current plan is unchanged.',
              'NO_ALTERNATIVE',
            );
          next = replacement;
        }
        if (edit.action === 'reduce_cost') {
          let changed = false;
          for (const item of trip.days[edit.day]) {
            if (item.locked) continue;
            const replacement = replaceItem(trip, edit.day, item.id, true);
            if (replacement) {
              next = replacement;
              changed = true;
              break;
            }
          }
          if (!changed)
            throw new AppError(
              409,
              'There is no confirmed lower-cost alternative with comparable price units. Your current plan is unchanged.',
              'NO_ALTERNATIVE',
            );
        }
        if (!store.compareAndSet('trips', trip.id, owner, edit.version, { ...record, trip: next }))
          throw new AppError(
            409,
            'A newer edit was saved first. Refresh your trip.',
            'STALE_VERSION',
          );
        return json(res, 200, { trip: next });
      }
      if (match[2] === 'cancel' && req.method === 'POST') {
        const job = store.get<ResearchJob>('jobs', trip.research!.jobId, owner);
        if (job) await cancelJob(job);
        return json(res, 200, { trip: getTrip(trip.id, owner).trip });
      }
      if (match[2] === 'research' && req.method === 'POST') {
        const job = store.get<ResearchJob>('jobs', trip.research!.jobId, owner);
        if (!job) throw new AppError(404, 'Research job not found.');
        if (['running', 'queued'].includes(job.status)) return json(res, 202, { trip });
        limit(owner, 'retry', 4, 3600000);
        job.status = 'queued';
        // Completed stages are reusable. A known provider run is polled again, never duplicated.
        if (!job.agentCandidates?.length) {
          job.agentDone = false;
          job.agentRetried = false;
        }
        if (!job.browserCandidates?.length) {
          job.browserAttempted = false;
          job.browserDone = false;
        }
        if (!job.documents?.length) job.documents = undefined;
        job.gaps = [];
        if (!job.leads?.length) job.leads = undefined;
        trip.research!.status = 'queued';
        trip.research!.phase = 'Retrying missing research';
        store.put('jobs', job.id, owner, job);
        store.put('trips', trip.id, owner, record, trip.version);
        return json(res, 202, { trip });
      }
      if (match[2] === 'watches' && req.method === 'GET')
        return json(res, 200, {
          watches: store
            .list<WatchRecord>('watches', owner)
            .filter((w) => w.watch.tripId === trip.id)
            .map(publicWatch),
        });
      if (match[2] === 'watches' && req.method === 'POST') {
        limit(owner, 'watch-create', 12, 3600000);
        const input = watchSchema.parse(await body(req));
        return json(res, 201, { watch: await createWatch(owner, trip.id, input) });
      }
    }
    const watch = path.match(/^\/api\/watches\/([a-f0-9-]{36})\/(pause|resume|stop|run|dismiss)$/);
    if (watch && req.method === 'POST') {
      const record = store.get<WatchRecord>('watches', watch[1], owner);
      if (!record) throw new AppError(404, 'Watch not found.');
      if (watch[2] === 'dismiss') {
        const { changeId } = z.object({ changeId: z.string().max(200) }).parse(await body(req));
        record.watch.changes = record.watch.changes.map((c) =>
          c.id === changeId ? { ...c, disposition: 'dismissed' } : c,
        );
        store.put('watches', record.watch.id, owner, record);
        return json(res, 200, { watch: record.watch });
      }
      limit(owner, 'watch-actions', 20, 3600000);
      return json(res, 200, {
        watch: await watchAction(record, watch[2] as 'pause' | 'resume' | 'stop' | 'run'),
      });
    }
    throw new AppError(404, 'This API route was not found.');
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(res, 400, {
        error: error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '),
        code: 'VALIDATION',
      });
    if (error instanceof AppError)
      return json(res, error.status, { error: error.message, code: error.code });
    console.error('API request failed:', error instanceof Error ? error.name : 'UnknownError');
    return json(res, 500, {
      error: 'The server could not complete this request. Please try again.',
      code: 'INTERNAL',
    });
  }
}
