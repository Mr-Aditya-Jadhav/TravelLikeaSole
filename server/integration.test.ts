import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const directory = mkdtempSync(join(tmpdir(), 'sole-tests-'));
process.env.DATA_DIRECTORY = directory;
process.env.TINYFISH_API_KEY = 'test-only-placeholder';
const { store, Store } = await import('./store.ts');
const { tinyfish, TinyFish } = await import('./tinyfish.ts');
const { api } = await import('./api.ts');
const { safeUrl, privateAddress } = await import('./security.ts');
const { ingest } = await import('./watches.ts');
const { schedule, eligible, candidateCost, replaceItem } = await import('./planning.ts');
const { createTrip } = await import('./jobs.ts');
const { defaultInput, defaultStyle, buildDraft } = await import('../src/lib/planner.ts');
type Candidate = import('../src/lib/research.ts').Candidate;
type WatchRecord = import('./watches.ts').WatchRecord;
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: crypto.randomUUID(),
  name: 'Temple garden',
  category: 'attraction',
  description: 'A quiet historic garden',
  url: `https://example.com/garden/${crypto.randomUUID()}`,
  evidenceIds: ['source'],
  durationMinutes: 60,
  walkingMinutes: 10,
  stepFree: true,
  diets: [],
  location: 'Kyoto, Japan',
  opensAt: '09:00',
  closesAt: '18:00',
  date: null,
  price: {
    amount: 500,
    currency: 'INR',
    unit: 'person',
    status: 'observed_generic',
    taxesIncluded: null,
  },
  gaps: [],
  source: 'Agent',
  ...overrides,
});
after(() => {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});

test('provider adapters use documented contracts and never expose authentication in results', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const client = new TinyFish('test-key', async (url, options) => {
    assert.equal((options?.headers as Record<string, string>)['X-API-Key'], 'test-key');
    const address = String(url);
    calls.push({
      url: address,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(String(options.body)) : null,
    });
    return new Response(
      JSON.stringify(
        address.includes('search.tinyfish')
          ? {
              results: [
                {
                  title: 'Official garden',
                  url: `https://example.com/garden/${crypto.randomUUID()}`,
                  snippet: 'Hours',
                },
              ],
            }
          : { results: [], errors: [{ url: 'https://example.com/blocked', error: 'blocked' }] },
      ),
      { status: 200 },
    );
  });
  assert.equal((await client.search('Kyoto official gardens'))[0].title, 'Official garden');
  assert.equal((await client.fetchPages(['https://example.com/blocked'])).errors.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('query'), 'Kyoto official gardens');
  assert.deepEqual(calls[1].body, {
    urls: ['https://example.com/blocked'],
    format: 'markdown',
    ttl: 0,
  });
});
test('non-idempotent provider starts are never silently retried', async () => {
  let calls = 0;
  const client = new TinyFish('test', async () => {
    calls++;
    throw new Error('network interrupted');
  });
  await assert.rejects(
    client.startAgent('https://example.com', 'Navigate', {}),
    /started automation may still be running/,
  );
  assert.equal(calls, 1);
});
test('wallet failures are actionable without leaking the provider response', async () => {
  const client = new TinyFish(
    'test',
    async () => new Response(JSON.stringify({ secret: 'DO_NOT_RENDER' }), { status: 402 }),
  );
  await assert.rejects(
    client.search('Kyoto'),
    (error) =>
      error instanceof Error &&
      /wallet/.test(error.message) &&
      !error.message.includes('DO_NOT_RENDER'),
  );
});
test('unsafe schemes, credentials, and private networks are rejected', () => {
  for (const url of [
    'file:///etc/passwd',
    'http://127.0.0.1',
    'http://2130706433',
    'http://169.254.169.254',
    'http://[::1]',
    'http://user:pass@example.com',
    'http://example.com:5432',
  ])
    assert.equal(safeUrl(url), null, url);
  assert.equal(
    safeUrl('https://www.japan-guide.com/e/e2158.html'),
    'https://www.japan-guide.com/e/e2158.html',
  );
  assert.equal(privateAddress('100.64.1.1'), true);
  assert.equal(privateAddress('172.31.1.2'), true);
  assert.equal(privateAddress('8.8.8.8'), false);
});
test('database ownership and optimistic versions prevent cross-session access and lost edits', () => {
  const db = new Store(':memory:');
  db.put('trips', 't', 'alice', { value: 1 }, 1);
  assert.equal(db.get('trips', 't', 'bob'), null);
  assert.equal(db.compareAndSet('trips', 't', 'bob', 1, { value: 2 }), false);
  assert.equal(db.compareAndSet('trips', 't', 'alice', 1, { value: 2 }), true);
  assert.equal(db.compareAndSet('trips', 't', 'alice', 1, { value: 3 }), false);
  assert.deepEqual(db.get('trips', 't', 'alice'), { value: 2 });
  db.db.close();
});
test('duplicate submissions create one durable trip and do not store a reusable profile', () => {
  const requestId = crypto.randomUUID();
  const input = { ...defaultInput, destination: 'Kyoto, Japan', budget: '50000' };
  const first = createTrip(input, defaultStyle, 'test-owner', requestId);
  const second = createTrip(input, defaultStyle, 'test-owner', requestId);
  assert.equal(first.id, second.id);
  assert.equal(store.list('jobs', 'test-owner').length, 1);
  assert.equal(store.list('profiles', 'test-owner').length, 0);
  assert.throws(
    () => createTrip({ ...input, budget: '70000' }, defaultStyle, 'test-owner', requestId),
    /different trip details/,
  );
});
test('hard diet and walking constraints reject unverified or conflicting candidates', () => {
  assert.equal(
    eligible(candidate({ category: 'food', diets: [] }), { ...defaultStyle, food: 'Vegetarian' }),
    false,
  );
  assert.equal(
    eligible(candidate({ category: 'food', diets: ['Vegetarian'] }), {
      ...defaultStyle,
      food: 'Vegetarian',
    }),
    true,
  );
  assert.equal(
    eligible(candidate({ walkingMinutes: null }), { ...defaultStyle, walking: 'Minimal walking' }),
    false,
  );
  assert.equal(
    eligible(candidate({ walkingMinutes: 70 }), { ...defaultStyle, walking: 'Easy walks' }),
    false,
  );
  assert.equal(
    eligible(candidate(), { ...defaultStyle, restrictions: 'Severe peanut allergy' }),
    false,
  );
});
test('room/night, group, and person cost units stay distinct and unknown stays unknown', () => {
  const trip = buildDraft(
    {
      ...defaultInput,
      destination: 'Kyoto',
      dateMode: 'flexible',
      duration: 3,
      travelers: 4,
      rooms: 2,
    },
    defaultStyle,
  );
  assert.equal(candidateCost(candidate(), trip), 2000);
  assert.equal(
    candidateCost(
      candidate({
        price: {
          amount: 1000,
          currency: 'INR',
          unit: 'room_night',
          status: 'observed_generic',
          taxesIncluded: null,
        },
      }),
      trip,
    ),
    4000,
  );
  assert.equal(
    candidateCost(
      candidate({
        price: {
          amount: null,
          currency: 'INR',
          unit: 'person',
          status: 'unknown',
          taxesIncluded: null,
        },
      }),
      trip,
    ),
    null,
  );
  assert.equal(
    candidateCost(
      candidate({
        price: {
          amount: 10,
          currency: 'USD',
          unit: 'person',
          status: 'observed_generic',
          taxesIncluded: null,
        },
      }),
      trip,
    ),
    null,
  );
});
test('scheduling respects closed weekdays, date-specific events, costs, and no-repeat visits', () => {
  const trip = buildDraft(
    {
      ...defaultInput,
      destination: 'Kyoto',
      dateMode: 'exact',
      startDate: '2030-01-07',
      endDate: '2030-01-08',
      budget: '1000',
    },
    defaultStyle,
  );
  const closed = candidate({ name: 'Closed on Monday', evidenceIds: ['closed'] });
  const expensive = candidate({
    name: 'Over budget',
    price: {
      amount: 5000,
      currency: 'INR',
      unit: 'person',
      status: 'observed_generic',
      taxesIncluded: null,
    },
  });
  const event = candidate({
    category: 'event',
    name: 'Wrong date event',
    date: '2030-01-09',
    opensAt: '10:00',
  });
  const valid = candidate({ name: 'Open garden' });
  const plan = schedule(
    trip,
    [closed, expensive, event, valid],
    [
      {
        id: 'closed',
        title: 'Hours',
        url: 'https://example.com',
        excerpt: 'Closed on Monday',
        retrievedAt: new Date().toISOString(),
        category: 'attraction',
        source: 'Fetch',
      },
    ],
  );
  assert.equal(
    plan.days[0].some((x) => x.candidateId === closed.id),
    false,
  );
  assert.equal(
    plan.days.flat().some((x) => x.candidateId === event.id || x.candidateId === expensive.id),
    false,
  );
  assert.equal(plan.days.flat().filter((x) => x.candidateId === valid.id).length, 1);
});
test('replanning preserves locks and rejects swaps that exceed the known budget', () => {
  const trip = buildDraft(
    { ...defaultInput, destination: 'Kyoto', budget: '1000', duration: 1 },
    defaultStyle,
  );
  const selected = candidate();
  trip.days[0][0] = {
    ...trip.days[0][0],
    candidateId: selected.id,
    locked: true,
    cost: 500,
    endTime: '12:00',
  };
  trip.research = {
    jobId: 'j',
    status: 'partial',
    phase: 'done',
    events: [],
    evidence: [],
    candidates: [
      selected,
      candidate({
        price: {
          amount: 5000,
          currency: 'INR',
          unit: 'person',
          status: 'observed_generic',
          taxesIncluded: null,
        },
      }),
    ],
    gaps: [],
    updatedAt: new Date().toISOString(),
  };
  assert.equal(replaceItem(trip, 0, trip.days[0][0].id), null);
  trip.days[0][0].locked = false;
  assert.equal(replaceItem(trip, 0, trip.days[0][0].id), null);
});
test('arrival and departure buffers prevent activities outside partial-day windows', () => {
  const trip = buildDraft(
    {
      ...defaultInput,
      destination: 'Kyoto',
      dateMode: 'exact',
      startDate: '2030-01-07',
      endDate: '2030-01-08',
      arrivalTime: '15:00',
      departureTime: '10:00',
      budget: '50000',
    },
    defaultStyle,
  );
  const plan = schedule(trip, [candidate()], []);
  assert.ok(plan.days[0].every((item) => item.time >= '16:30'));
  assert.ok(plan.days[1].every((item) => !item.candidateId));
  assert.equal(plan.days[1][0].time, '10:00');
  const packed = schedule(
    buildDraft(
      { ...defaultInput, destination: 'Kyoto', duration: 1, budget: '50000' },
      { ...defaultStyle, pace: 'Packed' },
    ),
    [],
    [],
  );
  assert.ok(packed.days[0].some((item) => item.time === '19:00'));
});
test('monitor baselines, unchanged runs, irrelevant changes, and duplicate deliveries stay quiet', () => {
  const record: WatchRecord = {
    owner: 'monitor-test',
    tokenHash: 't',
    seenUrls: [],
    seenRuns: [],
    nextCheckAt: 0,
    watch: {
      id: crypto.randomUUID(),
      tripId: 't',
      status: 'active',
      type: 'fetch',
      target: 'https://example.com',
      frequency: 'daily',
      expiresAt: '2030-01-01T00:00:00Z',
      createdAt: new Date().toISOString(),
      delivery: 'server',
      changes: [],
    },
  };
  ingest(record, { id: 'baseline', results: [{ url: 'https://example.com', text: 'Open' }] }, true);
  assert.equal(record.watch.changes.length, 1);
  ingest(record, {
    id: 'unchanged',
    results: [{ url: 'https://example.com', text: 'Open' }],
    outcome: 'unchanged',
  });
  assert.equal(record.watch.changes.length, 1);
  const changed = {
    id: 'change',
    results: [{ url: 'https://example.com', text: 'Closed for repairs' }],
    outcome: 'changed',
    judgment: { is_relevant: true, summary: 'Closed for repairs' },
  };
  ingest(record, changed);
  ingest(record, changed);
  assert.equal(record.watch.changes.length, 2);
  ingest(record, {
    id: 'cosmetic',
    results: [{ url: 'https://example.com', text: 'New footer' }],
    judgment: { is_relevant: false },
  });
  assert.equal(record.watch.changes.length, 2);
});

test('HTTP session isolation, CSRF, validation, save, and stale-edit behavior', async () => {
  const server = createServer(api);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await fetch(base + '/api/status');
    const cookie = status.headers.get('set-cookie')!.split(';')[0];
    assert.match(status.headers.get('set-cookie')!, /HttpOnly/);
    const trip = createTrip(
      { ...defaultInput, destination: 'Kyoto, Japan', budget: '50000' },
      defaultStyle,
      'http-owner',
      crypto.randomUUID(),
    );
    const foreign = await fetch(base + `/api/trips/${trip.id}`, { headers: { Cookie: cookie } });
    assert.equal(foreign.status, 404);
    const blocked = await fetch(base + '/api/trips', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: '{}',
    });
    assert.equal(blocked.status, 403);
    const malformed = await fetch(base + '/api/trips', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(malformed.status, 400);
    const hash = await import('node:crypto').then((m) =>
      m.createHash('sha256').update(cookie.split('=')[1]).digest('hex'),
    );
    const owned = createTrip(
      { ...defaultInput, destination: 'Kyoto, Japan', budget: '50000' },
      defaultStyle,
      hash,
      crypto.randomUUID(),
    );
    const save = await fetch(base + `/api/trips/${owned.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', version: owned.version }),
    });
    assert.equal(save.status, 200);
    const list = (await (
      await fetch(base + '/api/trips', { headers: { Cookie: cookie } })
    ).json()) as { trips: unknown[] };
    assert.equal(list.trips.length, 1);
    const stale = await fetch(base + `/api/trips/${owned.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quiet', version: 0, day: 0 }),
    });
    assert.equal(stale.status, 409);
    const record = store.get<import('./jobs.ts').TripRecord>('trips', owned.id, hash)!;
    const picked = candidate({ name: 'Booked Historic Shrine' });
    const alternative = candidate({
      name: 'Botanical Garden',
      description: 'Nature and a peaceful botanical forest garden.',
    });
    record.trip.research!.status = 'partial';
    record.trip.research!.candidates = [picked, alternative];
    record.trip.days[0][0] = {
      ...record.trip.days[0][0],
      candidateId: picked.id,
      title: picked.name,
      time: '09:30',
      endTime: '10:30',
      locked: true,
    };
    store.put('trips', owned.id, hash, record, owned.version);
    const optimize = await fetch(base + `/api/trips/${owned.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'optimize', version: owned.version }),
    });
    assert.equal(optimize.status, 200);
    const improved = (await optimize.json()) as { trip: import('../src/lib/planner.ts').Trip };
    assert.equal(improved.trip.version, owned.version + 1);
    assert.equal(improved.trip.research?.ranking?.version, 'hybrid-v1');
    assert.deepEqual(
      improved.trip.days[0].find((item) => item.candidateId === picked.id),
      record.trip.days[0][0],
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('application watches create baselines, keep local provider schedules paused, ingest checks, and expire', async () => {
  const { createWatch, watchAction, maintenance } = await import('./watches.ts');
  const calls: { method: string; url: string; body: unknown }[] = [];
  const original = tinyfish.fetcher;
  tinyfish.fetcher = async (url, options) => {
    const method = options?.method || 'GET';
    const address = String(url);
    calls.push({
      method,
      url: address,
      body: options?.body ? JSON.parse(String(options.body)) : null,
    });
    return new Response(
      JSON.stringify(
        address.endsWith('/runs')
          ? {
              run: {
                id: 'manual-check',
                results: [
                  { url: 'https://example.com/kyoto', title: 'Kyoto updates', snippet: 'Baseline' },
                  {
                    url: 'https://example.com/kyoto/new',
                    title: 'Kyoto cultural event',
                    snippet: 'A new event',
                  },
                ],
              },
            }
          : method === 'POST'
            ? {
                monitor: { id: 'provider-watch', status: 'active' },
                run: {
                  id: 'initial',
                  is_baseline: true,
                  results: [
                    {
                      url: 'https://example.com/kyoto',
                      title: 'Kyoto updates',
                      snippet: 'Baseline',
                    },
                  ],
                },
              }
            : { status: 'paused' },
      ),
      { status: 200 },
    );
  };
  try {
    const trip = createTrip(
      { ...defaultInput, destination: 'Kyoto, Japan', budget: '50000' },
      defaultStyle,
      'watch-owner',
      crypto.randomUUID(),
    );
    const watch = await createWatch('watch-owner', trip.id, {
      type: 'search',
      target: 'Kyoto closures and cultural events',
      frequency: 'daily',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      confirmed: true,
    });
    assert.equal(watch.status, 'active');
    assert.equal(watch.delivery, 'server');
    assert.equal(watch.changes.length, 1);
    assert.ok(
      calls.some((call) => call.method === 'PATCH' && JSON.stringify(call.body).includes('paused')),
    );
    const record = store.get<WatchRecord>('watches', watch.id, 'watch-owner')!;
    await watchAction(record, 'run');
    assert.equal(record.watch.changes.length, 2);
    await watchAction(record, 'pause');
    assert.equal(record.watch.status, 'paused');
    await watchAction(record, 'resume');
    assert.equal(record.watch.status, 'active');
    record.watch.expiresAt = new Date(Date.now() - 1000).toISOString();
    store.put('watches', record.watch.id, record.owner, record);
    await assert.rejects(watchAction(record, 'run'), /expired/);
    await maintenance();
    assert.equal(
      store.get<WatchRecord>('watches', record.watch.id, record.owner)?.watch.status,
      'stopped',
    );
  } finally {
    tinyfish.fetcher = original;
  }
});

test('an Agent run that finishes with no listings is retried once, never more', async () => {
  const { agentResearch } = await import('./jobs.ts');
  const original = tinyfish.fetcher;
  const listing = {
    name: 'Kiyomizudera',
    category: 'attraction',
    description: 'Hillside temple with a wooden stage.',
    url: 'https://www.japan-guide.com/e/e3901.html',
    location: 'Higashiyama, Kyoto',
    durationMinutes: 90,
    walkingMinutes: null,
    stepFree: null,
    diets: [],
    opensAt: '06:00',
    closesAt: '18:00',
    date: null,
    amount: 500,
    currency: 'JPY',
    priceUnit: 'person',
    taxesIncluded: null,
    gaps: [],
  };
  const run = async (results: unknown[]) => {
    let starts = 0;
    tinyfish.fetcher = async (url, options) => {
      const address = String(url);
      if (address.endsWith('/automation/run-async') && options?.method === 'POST')
        return new Response(JSON.stringify({ run_id: `run-${++starts}` }), { status: 200 });
      const index = Number(address.match(/runs\/run-(\d+)/)?.[1]) - 1;
      return new Response(
        JSON.stringify({ run_id: `run-${index + 1}`, status: 'COMPLETED', result: results[index] }),
        { status: 200 },
      );
    };
    const trip = createTrip(
      { ...defaultInput, destination: 'Kyoto, Japan', budget: '50000' },
      defaultStyle,
      'agent-owner',
      crypto.randomUUID(),
    );
    const job = {
      id: trip.research!.jobId,
      tripId: trip.id,
      owner: 'agent-owner',
      status: 'running' as const,
      createdAt: new Date().toISOString(),
      phase: '',
      events: [],
      gaps: [],
    };
    const outcome = await agentResearch(job, trip).then(
      () => 'ok',
      (error: { code?: string }) => error.code,
    );
    return { outcome, starts, job };
  };
  try {
    const recovered = await run([
      { candidates: [], gaps: [] },
      { candidates: [listing], gaps: [] },
    ]);
    assert.equal(recovered.outcome, 'ok');
    assert.equal(recovered.starts, 2);
    assert.equal(recovered.job.agentCandidates?.length, 1);
    const empty = await run([
      { candidates: [], gaps: [] },
      { candidates: [], gaps: [] },
    ]);
    assert.equal(empty.outcome, 'EMPTY_AGENT_RESULT');
    assert.equal(empty.starts, 2, 'only one retry is started');
  } finally {
    tinyfish.fetcher = original;
  }
});

test('guide, list, and calendar pages stay evidence instead of becoming activities', async () => {
  const { broadPage } = await import('./jobs.ts');
  for (const name of [
    'Kyoto Cultural Exploration: The Ultimate Guide',
    'JAPAN WITH KIDS Travel Planning',
    'Local’s Guide to the LX Factory, Lisbon’s Creative Hub',
    'Bali March Calendar: A Cultural Journey',
    'THE 15 BEST Things to Do in Lisbon (2026)',
    'Jaipur sightseeing: places to visit',
    '3-day Kyoto itinerary',
    'How Much Money Do I Need For Kyoto? - Inside Kyoto',
    'Is Bali worth visiting in the rainy season?',
    'Jaipur on a budget',
  ])
    assert.equal(broadPage(name), true, name);
  for (const name of [
    'Fushimi Inari Shrine - Kyoto Travel - japan-guide.com',
    'Kiyomizudera',
    'City Palace Museum Jaipur',
    'Jaigarh Heritage Festival',
    'Time Out Market Lisboa',
  ])
    assert.equal(broadPage(name), false, name);
});
