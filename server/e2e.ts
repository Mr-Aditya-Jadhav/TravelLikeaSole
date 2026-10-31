// End-to-end test cases against a running app, using real TinyFish research.
// Start the app first (npm run dev), then: npm run test:e2e [-- --only=1,3] [--keep]
// Cases 1–4 plan real trips (Search → Fetch → Agent → Browser → Planner) and edit them.
// Case 5 watches case 1's trip for changes (Monitor), then cleans up its own test monitors.
// Billing: each trip uses metered Search/Fetch/Agent/Browser calls; case 5 runs 3 monitor checks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.ts';
import {
  budgetTotal,
  defaultInput,
  defaultStyle,
  tripDays,
  type PlanItem,
  type TravelStyle,
  type Trip,
  type TripInput,
} from '../src/lib/planner.ts';
import type { ApiKind, TripWatch } from '../src/lib/research.ts';

const base = process.env.TEST_APP_URL || `http://${config.host}:${config.port}`;
const reportPath = resolve(process.env.E2E_REPORT || 'artifacts/e2e-report.json');
const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.split('=')[1]
  .split(',')
  .map(Number);
const keep = process.argv.includes('--keep');
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

type TripCase = {
  id: number;
  name: string;
  story: string;
  input: Partial<TripInput>;
  style: Partial<TravelStyle>;
  stayComparison: boolean;
};
const tripCases: TripCase[] = [
  {
    id: 1,
    name: 'Kyoto culture escape',
    story: 'Solo traveler, exact dates, temples and culture, vegetarian food, INR budget',
    input: {
      destination: 'Kyoto, Japan',
      origin: 'Delhi',
      dateMode: 'exact',
      startDate: day(40),
      endDate: day(42),
      party: 'Solo',
      travelers: 1,
      rooms: 1,
      budget: '60000',
      currency: 'INR',
      basis: 'per person',
    },
    style: {
      pace: 'Balanced',
      atmosphere: 'Quiet spaces',
      walking: 'Long walks',
      interests: ['Culture', 'Temples'],
      food: 'Vegetarian',
      stay: 'Boutique',
    },
    stayComparison: true,
  },
  {
    id: 2,
    name: 'Bali flexible wellness trip',
    story: 'Couple, flexible 4 days, beaches and wellness, vegan food, USD budget',
    input: {
      destination: 'Bali, Indonesia',
      dateMode: 'flexible',
      duration: 4,
      party: 'Couple',
      travelers: 2,
      rooms: 1,
      budget: '900',
      currency: 'USD',
      basis: 'per person',
    },
    style: {
      pace: 'Peaceful',
      atmosphere: 'Quiet spaces',
      interests: ['Beaches', 'Wellness', 'Nature'],
      food: 'Vegan',
      stay: 'Boutique',
    },
    stayComparison: false,
  },
  {
    id: 3,
    name: 'Jaipur family heritage trip',
    story:
      'Family of 4 in 2 rooms, exact dates with arrival/departure times, culture, food and shopping, whole-group INR budget',
    input: {
      destination: 'Jaipur, India',
      origin: 'Mumbai',
      dateMode: 'exact',
      startDate: day(48),
      endDate: day(51),
      party: 'Family',
      travelers: 4,
      rooms: 2,
      budget: '150000',
      currency: 'INR',
      basis: 'whole group',
      arrivalTime: '11:00',
      departureTime: '18:00',
    },
    style: {
      pace: 'Balanced',
      atmosphere: 'A mix',
      walking: 'Long walks',
      interests: ['Culture', 'Food', 'Shopping'],
      food: 'Vegetarian',
      stay: 'Simple private room',
    },
    stayComparison: true,
  },
  {
    id: 4,
    name: 'Lisbon friends getaway',
    story: '3 friends in 2 rooms, exact dates, nightlife, food and photography, packed pace, EUR',
    input: {
      destination: 'Lisbon, Portugal',
      dateMode: 'exact',
      startDate: day(70),
      endDate: day(73),
      party: 'Friends',
      travelers: 3,
      rooms: 2,
      budget: '700',
      currency: 'EUR',
      basis: 'per person',
    },
    style: {
      pace: 'Packed',
      atmosphere: 'Meet people',
      walking: 'Long walks',
      interests: ['Nightlife', 'Food', 'Photography'],
      food: 'Flexible',
      stay: 'Hostel',
    },
    stayComparison: true,
  },
];

let cookie = '';
async function call<T>(path: string, method = 'GET', data?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(150000),
  });
  const set = response.headers.get('set-cookie');
  if (set && !cookie) cookie = set.split(';')[0];
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  return { status: response.status, body };
}

type Check = { name: string; ok: boolean; detail: string };
type Result = {
  id: number;
  name: string;
  story: string;
  verdict: 'passed' | 'failed';
  seconds: number;
  apis: Partial<Record<ApiKind | 'Planner', { status: string; message: string }>>;
  counts: Record<string, number>;
  plan: {
    day: number;
    time: string;
    title: string;
    type: string;
    verification?: string;
    url?: string;
    source?: string;
  }[];
  stays: { name: string; url: string }[];
  agentFinds: { name: string; url: string }[];
  sourceHosts: string[];
  gaps: string[];
  checks: Check[];
};
const results: Result[] = [];
const minutes = (time?: string | null) =>
  time && /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
const log = (data: Record<string, unknown>) => console.log(JSON.stringify(data));

function verifyPlan(trip: Trip, spec: TripCase, checks: Check[]) {
  const research = trip.research!;
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const last = (api: string) => [...research.events].reverse().find((e) => e.api === api);
  const byId = new Map(research.candidates.map((c) => [c.id, c]));
  const evidenceIds = new Set(research.evidence.map((e) => e.id));
  const sourced = trip.days.flatMap((items, d) =>
    items.filter((item) => item.candidateId).map((item) => ({ item, d })),
  );

  add(
    'Research finished',
    ['partial', 'ready'].includes(research.status),
    `status=${research.status}`,
  );
  for (const api of ['Search', 'Fetch', 'Agent'] as const)
    add(`${api} completed`, last(api)?.status === 'complete', last(api)?.message || 'no event');
  if (spec.stayComparison)
    add(
      'Browser compared real stays',
      last('Browser')?.status === 'complete',
      last('Browser')?.message || 'no event',
    );
  else
    add(
      'Browser skipped flexible dates with an explanation',
      last('Browser')?.status === 'partial' && /exact dates/i.test(last('Browser')!.message),
      last('Browser')?.message || 'no event',
    );
  add('Evidence collected', research.evidence.length > 0, `${research.evidence.length} sources`);
  add('Sourced activities scheduled', sourced.length > 0, `${sourced.length} sourced slots`);
  add(
    'Day count matches the trip',
    trip.days.length === tripDays(trip.input),
    `${trip.days.length} days`,
  );

  const untraceable = sourced.filter(({ item }) => {
    const candidate = byId.get(item.candidateId!);
    return !candidate?.url || !candidate.evidenceIds.some((id) => evidenceIds.has(id));
  });
  add(
    'Every sourced slot links to its evidence',
    !untraceable.length,
    `${untraceable.length} without a source`,
  );

  const venues = sourced.map(({ item }) => byId.get(item.candidateId!)?.url);
  add(
    'No venue repeats across the trip',
    new Set(venues).size === venues.length,
    `${venues.length} visits`,
  );

  const outsideHours = sourced.filter(({ item }) => {
    const candidate = byId.get(item.candidateId!);
    const [open, close] = [minutes(candidate?.opensAt), minutes(candidate?.closesAt)];
    const [start, end] = [minutes(item.time)!, minutes(item.endTime) ?? minutes(item.time)! + 60];
    return (
      (open !== null && start < open) || (close !== null && close > (open ?? 0) && end > close)
    );
  });
  add(
    'Visits fit source-reported opening hours',
    !outsideHours.length,
    `${outsideHours.length} conflicts`,
  );

  const diet = trip.style.food;
  if (diet && !['No preference', 'Flexible', 'Nonvegetarian'].includes(diet)) {
    const wrong = sourced.filter(({ item }) => {
      const c = byId.get(item.candidateId!);
      return c?.category === 'food' && !c.diets.some((d) => d.toLowerCase() === diet.toLowerCase());
    });
    add(
      `Meals respect the ${diet} diet`,
      !wrong.length,
      `${wrong.length} unsuitable meals scheduled`,
    );
  }

  const known = trip.days.flat().reduce((sum, item) => sum + (item.cost || 0), 0);
  add(
    'Known costs stay within budget',
    known <= budgetTotal(trip.input),
    `${known} of ${budgetTotal(trip.input)} ${trip.input.currency}`,
  );

  const window = (d: number) => ({
    start: d === 0 && trip.input.arrivalTime ? minutes(trip.input.arrivalTime)! + 90 : 0,
    end:
      d === trip.days.length - 1 && trip.input.departureTime
        ? minutes(trip.input.departureTime)! - 90
        : 1440,
  });
  const outsideBuffers = trip.days.flatMap((items, d) =>
    items.filter(
      (item: PlanItem) =>
        item.effort !== 'Travel day' &&
        (minutes(item.time)! < window(d).start ||
          (minutes(item.endTime) ?? minutes(item.time)! + 60) > window(d).end),
    ),
  );
  add(
    'Arrival/departure buffers respected',
    !outsideBuffers.length,
    `${outsideBuffers.length} items outside the travel-day window`,
  );
}

async function runEdits(trip: Trip, checks: Check[]) {
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  let current = trip;
  const edit = async (data: Record<string, unknown>) => {
    const response = await call<{ trip: Trip }>(`/trips/${current.id}`, 'PATCH', {
      ...data,
      version: current.version,
    });
    if (response.status === 200) current = response.body.trip;
    return response;
  };
  const saved = await edit({ action: 'save' });
  add('Save trip', saved.status === 200 && current.saved === true, `HTTP ${saved.status}`);
  const listed = await call<{ trips: Trip[] }>('/trips');
  add(
    'Saved trip appears in My Trips',
    listed.body.trips?.some((t) => t.id === current.id) ?? false,
    `${listed.body.trips?.length ?? 0} saved`,
  );

  const dayIndex = current.days.findIndex((items) => items.some((item) => item.candidateId));
  if (dayIndex === -1) return current;
  const target = current.days[dayIndex].find((item) => item.candidateId)!;
  const locked = await edit({ action: 'lock', day: dayIndex, itemId: target.id, locked: true });
  add('Lock an activity', locked.status === 200, `HTTP ${locked.status}: ${target.title}`);

  const optimized = await edit({ action: 'optimize' });
  const kept = current.days[dayIndex].find(
    (item) => item.candidateId === target.candidateId && item.locked,
  );
  add(
    'Improve recommendations keeps the locked activity',
    optimized.status === 200 && kept?.time === target.time,
    `HTTP ${optimized.status}; locked item ${kept ? `still at ${kept.time}` : 'missing'}`,
  );

  const swappable = current.days
    .flatMap((items, d) => items.map((item) => ({ item, d })))
    .find(({ item }) => item.candidateId && !item.locked);
  if (swappable) {
    const before = swappable.item.candidateId;
    const swapped = await edit({ action: 'swap', day: swappable.d, itemId: swappable.item.id });
    const changed =
      swapped.status === 200 && !current.days[swappable.d].some((i) => i.candidateId === before);
    add(
      'Swap an activity for a researched alternative',
      changed || swapped.body.code === 'NO_ALTERNATIVE',
      swapped.status === 200
        ? `swapped "${swappable.item.title}"`
        : `HTTP ${swapped.status}: ${swapped.body.error}`,
    );
  }
  const stale = await call(`/trips/${current.id}`, 'PATCH', {
    action: 'quiet',
    day: 0,
    version: current.version - 1,
  });
  add('Stale edits are rejected', stale.status === 409, `HTTP ${stale.status}`);
  return current;
}

function summarize(spec: TripCase, trip: Trip, checks: Check[], seconds: number): Result {
  const research = trip.research!;
  const apis: Result['apis'] = {};
  for (const event of research.events)
    apis[event.api] = { status: event.status, message: event.message };
  const byId = new Map(research.candidates.map((c) => [c.id, c]));
  return {
    id: spec.id,
    name: spec.name,
    story: spec.story,
    verdict: checks.every((c) => c.ok) ? 'passed' : 'failed',
    seconds,
    apis,
    counts: {
      evidence: research.evidence.length,
      candidates: research.candidates.length,
      sourcedSlots: trip.days.flat().filter((i) => i.candidateId).length,
      days: trip.days.length,
      ...Object.fromEntries(
        (['Search', 'Fetch', 'Agent', 'Browser'] as const).map((s) => [
          `evidence${s}`,
          research.evidence.filter((e) => e.source === s).length,
        ]),
      ),
    },
    plan: trip.days.flatMap((items, d) =>
      items.map((item) => ({
        day: d + 1,
        time: item.time,
        title: item.title,
        type: item.type,
        verification: item.verification,
        url: item.candidateId ? byId.get(item.candidateId)?.url : undefined,
        source: item.candidateId ? byId.get(item.candidateId)?.source : undefined,
      })),
    ),
    stays: research.candidates
      .filter((c) => c.source === 'Browser')
      .map((c) => ({ name: c.name, url: c.url.split('?')[0] })),
    agentFinds: research.candidates
      .filter((c) => c.source === 'Agent')
      .map((c) => ({ name: c.name, url: c.url })),
    sourceHosts: [...new Set(research.evidence.map((e) => new URL(e.url).hostname))],
    gaps: research.gaps.slice(0, 12),
    checks,
  };
}

async function watchCase(trip: Trip): Promise<Result> {
  const started = Date.now();
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const created: TripWatch[] = [];
  const expiresAt = new Date(
    Math.min(Date.now() + 7 * 86400000, Date.parse(trip.input.endDate + 'T12:00:00Z')),
  ).toISOString();
  const source =
    trip.research!.evidence.find((e) => e.source === 'Fetch' && e.category === 'attraction') ||
    trip.research!.evidence.find((e) => e.source === 'Fetch');
  try {
    const page = await call<{ watch: TripWatch }>(`/trips/${trip.id}/watches`, 'POST', {
      type: 'fetch',
      target: source?.url,
      frequency: 'daily',
      expiresAt,
      confirmed: true,
    });
    const watch = page.body.watch;
    if (watch) created.push(watch);
    add(
      'Watch a source page (baseline captured)',
      page.status === 201 && watch?.status === 'active' && watch.changes[0]?.baseline === true,
      `HTTP ${page.status}: ${watch?.changes[0]?.summary || page.body.error} (${source?.url})`,
    );
    if (watch) {
      const checked = await call<{ watch: TripWatch }>(`/watches/${watch.id}/run`, 'POST', {});
      add(
        'Run a manual change check',
        checked.status === 200 &&
          !!checked.body.watch?.lastCheckedAt &&
          !checked.body.watch.lastError,
        `HTTP ${checked.status}; ${checked.body.watch?.changes.length ?? 0} change record(s)${checked.body.watch?.lastError ? `; ${checked.body.watch.lastError}` : ''}`,
      );
      for (const [action, expected] of [
        ['pause', 'paused'],
        ['resume', 'active'],
        ['stop', 'stopped'],
      ] as const) {
        const response = await call<{ watch: TripWatch }>(
          `/watches/${watch.id}/${action}`,
          'POST',
          {},
        );
        add(
          `Watch ${action}`,
          response.body.watch?.status === expected,
          `HTTP ${response.status}; status=${response.body.watch?.status}`,
        );
      }
    }
    const topic = `${trip.input.destination.split(',')[0]} cultural events ${new Date(trip.input.startDate).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
    const search = await call<{ watch: TripWatch }>(`/trips/${trip.id}/watches`, 'POST', {
      type: 'search',
      target: topic,
      frequency: 'six_hourly',
      expiresAt,
      confirmed: true,
    });
    if (search.body.watch) created.push(search.body.watch);
    add(
      'Watch a news/event topic (baseline captured)',
      search.status === 201 && search.body.watch?.status === 'active',
      `HTTP ${search.status}: "${topic}" ${search.body.watch?.changes[0]?.summary || search.body.error || ''}`,
    );
    if (search.body.watch) await call(`/watches/${search.body.watch.id}/stop`, 'POST', {});
    const wrongTopic = await call(`/trips/${trip.id}/watches`, 'POST', {
      type: 'search',
      target: 'Paris fashion week',
      frequency: 'daily',
      expiresAt,
      confirmed: true,
    });
    add('Off-topic watches are refused', wrongTopic.status === 400, `HTTP ${wrongTopic.status}`);
  } finally {
    // The app's Stop only pauses provider monitors; remove the ones this test created.
    const removed = await cleanupMonitors(created.map((w) => w.id)).catch(() => 0);
    add(
      'Test monitors removed from the TinyFish account',
      removed === created.length,
      `${removed} of ${created.length} deleted`,
    );
  }
  return {
    id: 5,
    name: 'Watch the Kyoto trip for changes',
    story:
      'Opt-in page and topic watches on the researched Kyoto trip: baseline, manual check, pause/resume/stop',
    verdict: checks.every((c) => c.ok) ? 'passed' : 'failed',
    seconds: Math.round((Date.now() - started) / 1000),
    apis: {
      Monitor: {
        status: checks.every((c) => c.ok) ? 'complete' : 'partial',
        message: `${created.length} monitors created and checked`,
      },
    },
    counts: { watches: created.length },
    plan: [],
    stays: [],
    agentFinds: [],
    sourceHosts: [],
    gaps: [],
    checks,
  };
}

async function cleanupMonitors(watchIds: string[]) {
  if (!watchIds.length) return 0;
  const headers = { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json' };
  const list = (await (
    await fetch('https://agent.tinyfish.ai/v1/monitors', { headers })
  ).json()) as {
    monitors?: { id: string; name?: string }[];
  };
  let removed = 0;
  for (const monitor of list.monitors || [])
    if (watchIds.some((id) => monitor.name?.includes(id))) {
      const response = await fetch(
        `https://agent.tinyfish.ai/v1/monitors/${encodeURIComponent(monitor.id)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
      if (response.ok) removed++;
    }
  return removed;
}

// ---- Run ----
const status = await call<{ configured: boolean; capabilities: string[] }>('/status');
if (status.status !== 200 || !status.body.configured)
  throw new Error(`App at ${base} is not running or TinyFish is not configured.`);
log({ e2e: 'start', base, capabilities: status.body.capabilities });

const selected = tripCases.filter(
  (c) => !only || only.includes(c.id) || (only.includes(5) && c.id === 1),
);
const started = new Map<number, { trip: Trip; at: number }>();
for (const spec of selected) {
  const response = await call<{ trip: Trip }>('/trips', 'POST', {
    input: { ...defaultInput, ...spec.input },
    style: { ...defaultStyle, ...spec.style },
    requestId: crypto.randomUUID(),
  });
  if (response.status !== 202)
    throw new Error(`Case ${spec.id} could not start: ${response.body.error}`);
  started.set(spec.id, { trip: response.body.trip, at: Date.now() });
  log({
    e2e: 'queued',
    case: spec.id,
    destination: spec.input.destination,
    tripId: response.body.trip.id,
  });
}

const finished = new Map<number, Trip>();
const phases = new Map<number, string>();
const deadline = Date.now() + 40 * 60000;
while (finished.size < started.size && Date.now() < deadline) {
  for (const [caseId, { trip }] of started) {
    if (finished.has(caseId)) continue;
    const response = await call<{ trip: Trip }>(`/trips/${trip.id}`);
    const research = response.body.trip?.research;
    if (!research) continue;
    if (phases.get(caseId) !== research.phase) {
      phases.set(caseId, research.phase);
      log({ e2e: 'progress', case: caseId, status: research.status, phase: research.phase });
    }
    if (!['queued', 'researching', 'validating'].includes(research.status))
      finished.set(caseId, response.body.trip);
  }
  if (finished.size < started.size) await new Promise((r) => setTimeout(r, 5000));
}

for (const spec of selected) {
  const trip = finished.get(spec.id);
  const at = started.get(spec.id)!.at;
  if (!trip) {
    results.push({
      ...summarize(
        spec,
        started.get(spec.id)!.trip,
        [{ name: 'Research finished', ok: false, detail: 'timed out' }],
        0,
      ),
      verdict: 'failed',
    });
    continue;
  }
  const seconds = Math.round((Date.parse(trip.research!.updatedAt) - at) / 1000);
  const checks: Check[] = [];
  verifyPlan(trip, spec, checks);
  const edited = await runEdits(trip, checks);
  finished.set(spec.id, edited);
  if (!only || only.includes(spec.id)) {
    results.push(summarize(spec, trip, checks, seconds));
    log({
      e2e: 'case',
      case: spec.id,
      verdict: results.at(-1)!.verdict,
      failed: checks.filter((c) => !c.ok),
    });
  }
}

const kyoto = finished.get(1);
if ((!only || only.includes(5)) && kyoto?.research?.evidence.length) {
  results.push(await watchCase(kyoto));
  log({
    e2e: 'case',
    case: 5,
    verdict: results.at(-1)!.verdict,
    failed: results.at(-1)!.checks.filter((c) => !c.ok),
  });
}

if (!keep) for (const trip of finished.values()) await call(`/trips/${trip.id}`, 'DELETE', {});

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  JSON.stringify({ ranAt: new Date().toISOString(), base, results }, null, 2),
);
console.log('\nCase  Verdict  Checks  Time   Name');
for (const r of results)
  console.log(
    `${String(r.id).padEnd(6)}${r.verdict.padEnd(9)}${`${r.checks.filter((c) => c.ok).length}/${r.checks.length}`.padEnd(8)}${`${r.seconds}s`.padEnd(7)}${r.name}`,
  );
console.log(`\nReport: ${reportPath}`);
if (results.some((r) => r.verdict === 'failed')) process.exitCode = 1;
