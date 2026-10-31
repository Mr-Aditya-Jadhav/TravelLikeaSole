import { createHash } from 'node:crypto';
import { tinyfish } from './tinyfish.ts';
import { store, id, now } from './store.ts';
import { AppError, publicUrl, safeUrl } from './security.ts';
import { config } from './config.ts';
import { compareStays } from './browser.ts';
import { experienceTask } from './agent.ts';
import { agentOutputSchema, extractionSchema } from './schemas.ts';
import { schedule, preserveResearchedPlan } from './planning.ts';
import { rankCandidates, BEAM_WIDTH, RANKING_VERSION } from './ranking.ts';
import {
  buildDraft,
  styleSummary,
  type Trip,
  type TripInput,
  type TravelStyle,
} from '../src/lib/planner.ts';
import type { Candidate, Evidence, ResearchEvent } from '../src/lib/research.ts';

export type TripRecord = { trip: Trip; owner: string; saved: boolean; expiresAt: number };
type Lead = { title: string; url: string; snippet: string; category: Candidate['category'] };
type Document = {
  url: string;
  title: string;
  text: string;
  category: Candidate['category'];
  retrievedAt: string;
};
export type ResearchJob = {
  id: string;
  tripId: string;
  owner: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled';
  createdAt: string;
  phase: string;
  leads?: Lead[];
  documents?: Document[];
  agentRunId?: string;
  agentAttempted?: boolean;
  agentDone?: boolean;
  browserAttempted?: boolean;
  browserDone?: boolean;
  browserSessionId?: string | null;
  agentCandidates?: Candidate[];
  browserCandidates?: Candidate[];
  agentEvidence?: Evidence[];
  browserEvidence?: Evidence[];
  events: ResearchEvent[];
  gaps: string[];
};
const running = new Set<string>();
let stopping = false;
const saveJob = (job: ResearchJob) => {
  const prior = store.get<ResearchJob>('jobs', job.id);
  if (prior?.status === 'cancel_requested' && !['cancelled', 'done', 'failed'].includes(job.status))
    job.status = 'cancel_requested';
  store.put('jobs', job.id, job.owner, job);
};
function update(
  job: ResearchJob,
  api: ResearchEvent['api'],
  status: ResearchEvent['status'],
  message: string,
  providerId?: string,
) {
  job.events.push({
    id: id(),
    api,
    status,
    message,
    at: now(),
    ...(providerId ? { providerId } : {}),
  });
  job.events = job.events.slice(-80);
  saveJob(job);
  const record = store.get<TripRecord>('trips', job.tripId, job.owner);
  if (!record) return;
  record.trip.research = {
    ...record.trip.research!,
    phase: job.phase,
    events: job.events,
    gaps: job.gaps,
    updatedAt: now(),
  };
  store.put('trips', job.tripId, job.owner, record, record.trip.version);
}
const cancelRequested = (job: ResearchJob) =>
  store.get<ResearchJob>('jobs', job.id)?.status === 'cancel_requested';
function checkCancel(job: ResearchJob) {
  if (cancelRequested(job)) throw new AppError(409, 'Research was cancelled.', 'CANCELLED');
}
export function interpret(style: TravelStyle, owner: string) {
  const hash = createHash('sha256').update(JSON.stringify(style)).digest('hex');
  const key = owner + hash;
  const cached = store.get<{ summary: string; method: string; inputHash: string }>(
    'interpretations',
    key,
    owner,
  );
  if (cached) return cached;
  const result = { summary: styleSummary(style), method: 'rules', inputHash: hash };
  store.put('interpretations', key, owner, result);
  return result;
}
export function createTrip(
  input: TripInput,
  style: TravelStyle,
  owner: string,
  requestId: string,
): Trip {
  const prior = store.get<{ tripId: string; hash: string }>('requests', owner + requestId, owner);
  const hash = createHash('sha256').update(JSON.stringify({ input, style })).digest('hex');
  if (prior) {
    if (prior.hash !== hash)
      throw new AppError(409, 'This request ID was already used with different trip details.');
    const record = store.get<TripRecord>('trips', prior.tripId, owner);
    if (record) return record.trip;
  }
  const trip = buildDraft(input, style);
  trip.serverOwned = true;
  trip.saved = false;
  trip.summary = interpret(style, owner).summary;
  const job: ResearchJob = {
    id: id(),
    tripId: trip.id,
    owner,
    status: 'queued',
    createdAt: now(),
    phase: 'Waiting to research your escape',
    events: [],
    gaps: [],
  };
  trip.research = {
    jobId: job.id,
    status: 'queued',
    phase: job.phase,
    events: [],
    evidence: [],
    candidates: [],
    gaps: [],
    updatedAt: now(),
  };
  store.transaction(() => {
    store.put('trips', trip.id, owner, {
      trip,
      owner,
      saved: false,
      expiresAt: Date.now() + 86400000,
    } satisfies TripRecord);
    saveJob(job);
    store.put('requests', owner + requestId, owner, { tripId: trip.id, hash });
  });
  return trip;
}
function toFetchedCandidate(document: Document, evidence: Evidence, trip: Trip): Candidate {
  const text = document.text;
  const title = document.title
    .replace(/\s+[|–—]\s+.*$/, '')
    .replace(/\s+-\s+(official|home).*$/i, '')
    .trim()
    .slice(0, 200);
  const diets = ['Vegetarian', 'Vegan', 'Jain'].filter(
    (d) =>
      new RegExp(
        `(?:pure|100%|entirely|fully)\\s+${d}|${d}[ -]friendly|${d}\\s+(?:menu|options|restaurant|dishes|food)`,
        'i',
      ).test(text) && !new RegExp(`(?:no|not|without)\\s+(?:any\\s+)?${d}`, 'i').test(text),
  );
  return {
    id: id(),
    name: title || trip.input.destination,
    category: document.category,
    description:
      text
        .replace(/^#+.*$/gm, '')
        .replace(/\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/[\s*#_]+/g, ' ')
        .trim()
        .slice(0, 360) || document.title,
    url: document.url,
    evidenceIds: [evidence.id],
    durationMinutes: null,
    walkingMinutes: null,
    stepFree: null,
    diets,
    location: null,
    opensAt: null,
    closesAt: null,
    date: null,
    price: {
      amount: null,
      currency: trip.input.currency,
      unit: 'unknown',
      status: 'unknown',
      taxesIncluded: null,
    },
    gaps: ['Hours, duration, access, and prices need confirmation on the source.'],
    source: 'Fetch',
  };
}
async function agentResearch(job: ResearchJob, trip: Trip) {
  if (job.agentDone) return;
  checkCancel(job);
  job.phase = 'Checking interactive experience listings';
  const { url, goal } = experienceTask(
    trip,
    job.id,
    job.leads?.find((lead) => lead.category === 'attraction')?.url,
  );
  if (!job.agentRunId) {
    if (job.agentAttempted) {
      // A lost POST response may already have started the run. Recover by its unique goal reference.
      const raw = await tinyfish.request<{ data?: { run_id: string }[] }>(
        `https://agent.tinyfish.ai/v1/runs?goal=${encodeURIComponent(`Sole job ${job.id}`)}&limit=5`,
      );
      if (raw.data?.[0]) job.agentRunId = raw.data[0].run_id;
      else {
        job.gaps.push(
          'An Agent start response was interrupted. No duplicate run was started. Check TinyFish run history.',
        );
        job.agentDone = true;
        saveJob(job);
        return;
      }
    } else {
      job.agentAttempted = true;
      saveJob(job);
      job.agentRunId = await tinyfish.startAgent(url, goal, agentOutputSchema);
    }
    saveJob(job);
  }
  update(
    job,
    'Agent',
    'running',
    'Applying experience filters and opening detail pages.',
    job.agentRunId,
  );
  const deadline = Date.now() + (config.agentTimeoutSeconds + 90) * 1000;
  while (Date.now() < deadline) {
    checkCancel(job);
    const run = await tinyfish.getRun(job.agentRunId!);
    if (run.status === 'COMPLETED') {
      let result = run.result;
      if (result && typeof result === 'object' && 'result' in result)
        result = (result as { result: unknown }).result;
      if (typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch {
          /* Schema validation reports the actual extraction gap. */
        }
      }
      const parsed = extractionSchema.safeParse(result);
      if (!parsed.success || !parsed.data.candidates.length)
        throw new AppError(
          502,
          'The experience site returned no usable structured listings.',
          'EMPTY_AGENT_RESULT',
        );
      const evidence: Evidence[] = [];
      const candidates: Candidate[] = [];
      for (const item of parsed.data.candidates) {
        const safe = safeUrl(item.url);
        if (!safe) continue;
        const sourceId = id();
        const priceCurrency = /^[A-Za-z]{3}$/.test(item.currency)
          ? item.currency.toUpperCase()
          : null;
        evidence.push({
          id: sourceId,
          url: safe,
          title: item.name,
          excerpt: item.description.slice(0, 600),
          retrievedAt: now(),
          category: item.category,
          source: 'Agent',
        });
        candidates.push({
          id: id(),
          name: item.name,
          category: item.category,
          description: item.description,
          url: safe,
          evidenceIds: [sourceId],
          durationMinutes: item.durationMinutes,
          walkingMinutes: item.walkingMinutes,
          stepFree: item.stepFree,
          diets: item.diets,
          location: item.location,
          coordinates:
            item.latitude != null && item.longitude != null
              ? { latitude: item.latitude, longitude: item.longitude }
              : null,
          opensAt: item.opensAt,
          closesAt: item.closesAt,
          date: item.date,
          price: {
            amount: priceCurrency ? item.amount : null,
            currency: priceCurrency || trip.input.currency,
            unit: item.priceUnit,
            status: item.amount === null || !priceCurrency ? 'unknown' : 'observed_generic',
            taxesIncluded: item.taxesIncluded,
          },
          gaps: [
            ...item.gaps,
            'Recheck dates, conditions, and availability with the provider before booking.',
          ],
          source: 'Agent',
        });
      }
      if (!candidates.length)
        throw new AppError(
          502,
          'The experience site returned no safe detail links.',
          'EMPTY_AGENT_RESULT',
        );
      job.agentCandidates = candidates;
      job.agentEvidence = evidence;
      job.gaps.push(...parsed.data.gaps);
      job.agentDone = true;
      update(
        job,
        'Agent',
        'complete',
        `Compared ${candidates.length} experience detail pages.`,
        job.agentRunId,
      );
      return;
    }
    if (run.status === 'FAILED' || run.status === 'CANCELLED')
      throw new AppError(
        502,
        run.error?.category === 'BILLING_FAILURE'
          ? 'TinyFish could not fund the interactive experience check. Add credits in the TinyFish dashboard.'
          : 'The interactive experience check did not complete. Other source research is still available.',
        'AGENT_FAILED',
      );
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new AppError(
    504,
    'The Agent result is not ready yet. Its run ID has been saved; no duplicate run was started.',
    'AGENT_PENDING',
  );
}
async function runJob(job: ResearchJob) {
  const record = store.get<TripRecord>('trips', job.tripId, job.owner);
  if (!record) return;
  let trip = record.trip;
  job.status = 'running';
  saveJob(job);
  trip.research!.status = 'researching';
  store.put('trips', trip.id, job.owner, { ...record, trip }, trip.version);
  try {
    if (job.browserSessionId) {
      await tinyfish.closeBrowser(job.browserSessionId);
      job.browserSessionId = null;
      job.browserDone = true;
      job.gaps.push('A browser comparison interrupted by restart was closed safely.');
      saveJob(job);
    }
    if (!job.leads) {
      job.phase = 'Finding local and official sources';
      update(
        job,
        'Search',
        'running',
        'Looking for attractions, food, stays, transport, and cultural events.',
      );
      const dateText =
        trip.input.dateMode === 'exact'
          ? `${trip.input.startDate} to ${trip.input.endDate}`
          : 'travel guide';
      const queries: { category: Candidate['category']; query: string }[] = [
        {
          category: 'attraction',
          query: `${JSON.stringify(trip.input.destination)} ${trip.style.interests.join(' ')} official attraction opening hours admission`,
        },
        {
          category: 'food',
          query: `${JSON.stringify(trip.input.destination)} ${trip.style.food || 'local'} restaurant official menu`,
        },
        {
          category: 'stay',
          query: `${JSON.stringify(trip.input.destination)} ${trip.style.stay || 'hotel'} official accommodation rooms`,
        },
        {
          category: 'transport',
          query: `${trip.input.origin ? `${trip.input.origin} to ` : ''}${JSON.stringify(trip.input.destination)} official transport train bus fares`,
        },
        {
          category: 'event',
          query: `${JSON.stringify(trip.input.destination)} ${dateText} official cultural events calendar`,
        },
      ];
      const leads: Lead[] = [];
      for (const item of queries) {
        checkCancel(job);
        try {
          const results = await tinyfish.search(item.query);
          leads.push(
            ...results
              .slice(0, 3)
              .filter((r) => safeUrl(r.url))
              .map((r) => ({ ...r, category: item.category })),
          );
        } catch (error) {
          if (error instanceof AppError && [401, 402, 403].includes(error.status)) throw error;
          job.gaps.push(`Search for ${item.category} sources was unavailable.`);
        }
      }
      job.leads = leads;
      saveJob(job);
      if (!leads.length)
        throw new AppError(
          502,
          'No usable destination sources were found. Adjust the destination or retry later.',
          'NO_SOURCES',
        );
      update(
        job,
        'Search',
        'complete',
        `Found ${leads.length} source leads across five travel categories.`,
      );
    }
    if (!job.documents) {
      job.phase = 'Reading source details';
      update(job, 'Fetch', 'running', 'Reading source pages and recording their retrieval times.');
      const selected: Lead[] = [];
      const seen = new Set<string>();
      for (const category of ['attraction', 'food', 'stay', 'transport', 'event'])
        for (const lead of job.leads.filter((l) => l.category === category).slice(0, 2)) {
          if (seen.has(lead.url)) continue;
          try {
            await publicUrl(lead.url);
            selected.push(lead);
            seen.add(lead.url);
          } catch {
            job.gaps.push(`A ${category} source could not be safely accessed.`);
          }
        }
      const fetched = selected.length
        ? await tinyfish.fetchPages(selected.map((x) => x.url))
        : { results: [], errors: [] };
      const documents: Document[] = [];
      for (const page of fetched.results) {
        const url = safeUrl(page.final_url || page.url);
        if (!url || page.text.trim().length < 80) continue;
        const lead = selected.find((l) => l.url === page.url);
        documents.push({
          url,
          title: page.title || lead?.title || 'Source page',
          text: page.text.slice(0, 30000),
          category: lead?.category || 'attraction',
          retrievedAt: now(),
        });
      }
      job.documents = documents;
      if (fetched.errors.length)
        job.gaps.push(`${fetched.errors.length} source page(s) could not be read.`);
      saveJob(job);
      update(
        job,
        'Fetch',
        documents.length ? 'complete' : 'partial',
        `Read ${documents.length} supporting source pages.`,
      );
    }
    try {
      await agentResearch(job, trip);
    } catch (error) {
      if (error instanceof AppError && error.code === 'CANCELLED') throw error;
      job.agentDone = true;
      job.gaps.push(
        error instanceof AppError
          ? error.message
          : 'Interactive experience research was unavailable.',
      );
      update(job, 'Agent', 'partial', job.gaps.at(-1)!);
    }
    checkCancel(job);
    if (!job.browserDone) {
      if (job.browserAttempted) {
        job.browserDone = true;
        job.gaps.push('An interrupted browser comparison was not started again automatically.');
        saveJob(job);
      } else {
        job.browserAttempted = true;
        job.phase = 'Comparing date-specific stays';
        saveJob(job);
        if (trip.input.dateMode === 'exact' && trip.input.startDate !== trip.input.endDate) {
          update(
            job,
            'Browser',
            'running',
            'Applying your destination, dates, room count, and adult occupancy on Booking.com.',
          );
          try {
            const result = await compareStays(trip, (sessionId) => {
              job.browserSessionId = sessionId;
              saveJob(job);
            });
            job.browserCandidates = result.candidates;
            job.browserEvidence = result.evidence;
            job.gaps.push(...result.gaps);
            update(
              job,
              'Browser',
              result.candidates.length ? 'complete' : 'partial',
              result.candidates.length
                ? `Compared ${result.candidates.length} stays for the selected dates and occupancy.`
                : 'No date-specific comparison was available.',
            );
          } catch {
            job.gaps.push(
              'Booking.com could not confirm the selected filters or was inaccessible. Use the stay source links to search availability; no live room price was invented.',
            );
            update(
              job,
              'Browser',
              'partial',
              'The stay provider was blocked or its filters could not be confirmed.',
            );
          }
        } else
          update(
            job,
            'Browser',
            'partial',
            'Stay comparison is available for exact dates with at least one accommodation night.',
          );
        job.browserDone = true;
        saveJob(job);
      }
    }
    checkCancel(job);
    job.phase = 'Checking personal fit and shaping your days';
    update(
      job,
      'Planner',
      'running',
      'Filtering options, preserving downtime, and checking time and budget units.',
    );
    const evidence: Evidence[] = [];
    const candidates: Candidate[] = [];
    for (const document of job.documents) {
      const source: Evidence = {
        id: id(),
        url: document.url,
        title: document.title,
        excerpt: document.text.replace(/\s+/g, ' ').slice(0, 650),
        retrievedAt: document.retrievedAt,
        category: document.category,
        source: 'Fetch',
      };
      evidence.push(source);
      candidates.push(toFetchedCandidate(document, source, trip));
    }
    evidence.push(...(job.agentEvidence || []), ...(job.browserEvidence || []));
    candidates.push(...(job.agentCandidates || []), ...(job.browserCandidates || []));
    // Broad lists and guide homepages remain sources, not invented individual attractions.
    const usable = rankCandidates(
      candidates.filter(
        (c) =>
          c.source !== 'Fetch' ||
          !/(?:\btop\s+\d|\bbest\s+\d|\bbest.*restaurants|restaurants in|things to do|travel guide|official tourism|tourism board|homepage)/i.test(
            c.name,
          ),
      ),
      trip,
      evidence,
    );
    trip = schedule(trip, usable, evidence);
    job.gaps.push(
      'Suggested times and 30-minute transfer buffers are planning estimates; confirm venue hours and actual routes.',
    );
    if (trip.input.dateMode === 'flexible')
      job.gaps.push('Flexible dates: no event or availability claim is date-verified.');
    if (trip.style.restrictions)
      job.gaps.push(
        'Your explicit dietary/accessibility restrictions require direct venue confirmation. Unverified options are kept out of confirmed slots.',
      );
    const status = usable.length ? 'partial' : 'failed';
    trip.research = {
      jobId: job.id,
      status,
      phase: usable.length
        ? 'Your sourced plan is ready to review'
        : 'Research finished without suitable confirmed options',
      events: job.events,
      evidence,
      candidates: usable,
      gaps: [...new Set(job.gaps)],
      updatedAt: now(),
      destination: { name: trip.input.destination, timezone: null },
      ranking: {
        version: RANKING_VERSION,
        method: 'BM25 relevance, weighted fit, MMR diversity, bounded beam search',
        beamWidth: BEAM_WIDTH,
        rankedAt: now(),
      },
    };
    trip = preserveResearchedPlan(record.trip, trip);
    trip.version++;
    const current = store.get<TripRecord>('trips', trip.id, job.owner)!;
    trip.saved = current.saved;
    store.put('trips', trip.id, job.owner, { ...current, trip }, trip.version);
    job.status = 'done';
    job.phase = trip.research!.phase;
    update(
      job,
      'Planner',
      usable.length ? 'complete' : 'partial',
      `Collected ${usable.length} candidates and ${evidence.length} source records. Review the listed verification gaps.`,
    );
  } catch (error) {
    const cancelled = error instanceof AppError && error.code === 'CANCELLED';
    job.status = cancelled ? 'cancelled' : 'failed';
    job.phase = cancelled ? 'Research cancelled' : 'Research needs attention';
    const message =
      error instanceof AppError
        ? error.message
        : 'Research stopped unexpectedly. Your selections and any completed provider run IDs have been saved.';
    job.gaps.push(message);
    update(job, 'Planner', 'failed', message);
    const current = store.get<TripRecord>('trips', trip.id, job.owner);
    if (current) {
      current.trip.research!.status = cancelled ? 'cancelled' : 'failed';
      store.put('trips', trip.id, job.owner, current, current.trip.version);
    }
  } finally {
    saveJob(job);
    running.delete(job.id);
  }
}
export function startWorkers() {
  for (const job of store.list<ResearchJob>('jobs'))
    if (job.status === 'running') {
      job.status = 'queued';
      saveJob(job);
    }
  for (const job of store.list<ResearchJob>('jobs'))
    if (job.status === 'cancel_requested') void cancelJob(job).catch(() => {});
  const tick = () => {
    if (stopping) return;
    for (const job of store.list<ResearchJob>('jobs').filter((j) => j.status === 'queued')) {
      if (running.size >= config.maxConcurrentJobs) break;
      if (running.has(job.id)) continue;
      running.add(job.id);
      void runJob(job);
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  timer.unref();
  return () => {
    stopping = true;
    clearInterval(timer);
  };
}
export async function cancelJob(job: ResearchJob) {
  if (['done', 'failed', 'cancelled'].includes(job.status)) return;
  job.status = 'cancel_requested';
  saveJob(job);
  if (job.agentRunId) await tinyfish.cancelRun(job.agentRunId);
  if (job.browserSessionId) {
    await tinyfish.closeBrowser(job.browserSessionId);
    job.browserSessionId = null;
    saveJob(job);
  }
  if (!running.has(job.id)) {
    job.status = 'cancelled';
    saveJob(job);
    const record = store.get<TripRecord>('trips', job.tripId, job.owner);
    if (record) {
      record.trip.research!.status = 'cancelled';
      record.trip.research!.phase = 'Research cancelled';
      store.put('trips', job.tripId, job.owner, record, record.trip.version);
    }
  }
}
