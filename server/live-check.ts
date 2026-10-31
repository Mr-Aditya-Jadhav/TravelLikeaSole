import { tinyfish, endpoints } from './tinyfish.ts';
import { compareStays } from './browser.ts';
import { experienceTask } from './agent.ts';
import { agentOutputSchema, extractionSchema } from './schemas.ts';
import { buildDraft, defaultInput, defaultStyle } from '../src/lib/planner.ts';
import { config } from './config.ts';

if (!config.apiKey)
  throw new Error('Set TINYFISH_API_KEY on the server before running live checks.');
if (process.argv.includes('--inspect-agent')) {
  const records = await tinyfish.request<{ data: { run_id: string }[] }>(
    `${endpoints.agent}/runs?goal=${encodeURIComponent('On this experience website')}&limit=2`,
  );
  for (const record of records.data) {
    const run = await tinyfish.getRun(record.run_id);
    console.log(
      JSON.stringify({ id: run.run_id, status: run.status, result: run.result }).slice(0, 6500),
    );
  }
  process.exit(0);
}
const all = process.argv.includes('--all');
const only = process.argv.find((x) => x.startsWith('--only='))?.split('=')[1];
if (process.argv.includes('--workflow')) {
  const base = process.env.TEST_APP_URL || 'http://127.0.0.1:5173';
  const boot = await fetch(base + '/api/status');
  const cookie = boot.headers.get('set-cookie')?.split(';')[0] || '';
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };
  const response = await fetch(base + '/api/trips', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { ...defaultInput, destination: 'Kyoto, Japan', budget: '60000', duration: 2 },
      style: {
        ...defaultStyle,
        pace: 'Balanced',
        interests: ['Culture', 'Temples'],
        food: 'Vegetarian',
      },
      requestId: crypto.randomUUID(),
    }),
  });
  if (!response.ok) throw new Error('App create-trip failed: ' + (await response.text()));
  let { trip } = await response.json();
  console.log(JSON.stringify({ workflow: 'started', tripId: trip.id }));
  const deadline = Date.now() + 420000;
  let phase = '';
  while (Date.now() < deadline) {
    ({ trip } = await (await fetch(base + `/api/trips/${trip.id}`, { headers })).json());
    if (trip.research.phase !== phase) {
      phase = trip.research.phase;
      console.log(JSON.stringify({ workflow: 'progress', phase }));
    }
    if (!['queued', 'researching', 'validating'].includes(trip.research.status)) {
      if (!trip.research.evidence.length || !trip.research.candidates.length)
        throw new Error('No usable app research: ' + trip.research.gaps.join(' '));
      const saved = await fetch(base + `/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'save', version: trip.version }),
      });
      if (!saved.ok) throw new Error('Save-trip failed');
      const activity = trip.days[0].find((item: { candidateId?: string }) => item.candidateId);
      if (activity) {
        const locked = await fetch(base + `/api/trips/${trip.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            action: 'lock',
            version: trip.version,
            day: 0,
            itemId: activity.id,
            locked: true,
          }),
        });
        if (!locked.ok) throw new Error('Lock-trip failed');
      }
      console.log(
        JSON.stringify({
          workflow: 'passed',
          tripId: trip.id,
          evidence: trip.research.evidence.length,
          candidates: trip.research.candidates.length,
          scheduled: trip.days.flat().filter((x: { candidateId?: string }) => x.candidateId).length,
          status: trip.research.status,
          events: trip.research.events.map((e: { api: string; status: string }) => ({
            api: e.api,
            status: e.status,
          })),
        }),
      );
      await fetch(base + `/api/trips/${trip.id}`, { method: 'DELETE', headers, body: '{}' });
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Workflow still pending for trip ${trip.id}; provider job IDs are retained.`);
}
const results: { api: string; status: string; details: string }[] = [];
async function check(api: string, fn: () => Promise<string>) {
  try {
    const details = await fn();
    results.push({ api, status: 'passed', details });
    console.log(JSON.stringify(results.at(-1)));
  } catch (error) {
    results.push({
      api,
      status: 'failed',
      details: error instanceof Error ? error.message : 'Request failed',
    });
    console.log(JSON.stringify(results.at(-1)));
  }
}
if (!only || only === 'Search')
  await check('Search', async () => {
    const found = await tinyfish.search('Kyoto Fushimi Inari official shrine');
    if (!found.some((r) => r.url && r.title)) throw new Error('No usable search results');
    return `${found.length} real source URLs returned`;
  });
if (!only || only === 'Fetch')
  await check('Fetch', async () => {
    const pages = await tinyfish.fetchPages(['https://inari.jp/en/']);
    if (!pages.results.some((r) => r.text.length > 100)) throw new Error('No usable page text');
    return `${pages.results.length} live page(s) extracted`;
  });
if (all || only) {
  const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10);
  const trip = buildDraft(
    {
      ...defaultInput,
      destination: 'Kyoto, Japan',
      dateMode: 'exact',
      startDate: start,
      endDate: end,
      budget: '60000',
      rooms: 1,
    },
    defaultStyle,
  );
  if (all || only === 'Browser')
    await check('Browser', async () => {
      const result = await compareStays(trip, () => {});
      if (!result.candidates.length) throw new Error(result.gaps.join(' '));
      return `${result.candidates.length} date/occupancy-filtered stays compared; session closed`;
    });
  if (all || only === 'Agent')
    await check('Agent', async () => {
      const task = experienceTask(trip, crypto.randomUUID());
      const runId = await tinyfish.startAgent(task.url, task.goal, agentOutputSchema);
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        const run = await tinyfish.getRun(runId);
        if (run.status === 'COMPLETED') {
          let data = run.result;
          if (typeof data === 'string') data = JSON.parse(data);
          const parsed = extractionSchema.safeParse(data);
          if (!parsed.success || !parsed.data.candidates.length)
            throw new Error(
              'Agent completed without usable structured candidates: ' +
                JSON.stringify({
                  runId,
                  issues: parsed.success ? [] : parsed.error.issues.slice(0, 8),
                  result: data,
                }).slice(0, 2400),
            );
          return `${parsed.data.candidates.length} structured experience(s) extracted; run ${runId}`;
        }
        if (['FAILED', 'CANCELLED'].includes(run.status))
          throw new Error(`Agent ended with ${run.status}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
      throw new Error(`Agent result pending; do not duplicate run ${runId}`);
    });
  if (all || only === 'Monitor')
    await check('Monitor', async () => {
      let monitorId: string | undefined;
      try {
        const created = await tinyfish.createMonitor({
          type: 'fetch',
          name: 'Sole integration smoke test — temporary',
          config: { url: 'https://example.com', format: 'markdown' },
          schedule_cron: '0 9 * * *',
          purpose: 'Controlled integration check for page content changes.',
        });
        monitorId = created.monitor.id;
        await tinyfish.monitorAction(monitorId, 'pause');
        const run = (await tinyfish.monitorAction(monitorId, 'run')) as { run?: unknown };
        if (!created.run || !run.run)
          throw new Error('Monitor did not return a baseline and run-now result');
        return 'Baseline and manual check returned; temporary daily monitor paused and deleted';
      } finally {
        if (monitorId)
          await tinyfish.request(
            `${endpoints.agent}/monitors/${encodeURIComponent(monitorId)}`,
            'DELETE',
          );
      }
    });
}
console.log(JSON.stringify({ summary: results }));
if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
