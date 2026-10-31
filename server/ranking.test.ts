import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Candidate, Evidence } from '../src/lib/research.ts';
import { buildDraft, defaultInput, defaultStyle, type TravelStyle } from '../src/lib/planner.ts';
import {
  rankCandidates,
  diversifyCandidates,
  themes,
  normalizedCost,
  candidateSimilarity,
  distanceKm,
  contextualRanking,
  canonicalUrl,
  destinationMatch,
} from './ranking.ts';

const directory = mkdtempSync(join(tmpdir(), 'sole-ranking-'));
process.env.DATA_DIRECTORY = directory;
const { schedule, replaceItem, preserveResearchedPlan } = await import('./planning.ts');
const { store } = await import('./store.ts');
after(() => {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
const NOW = Date.now();
const slug = (name: string) => name.toLowerCase().replace(/\W+/g, '-');
function candidate(name: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: slug(name),
    name,
    description: 'A researched local experience.',
    category: 'attraction',
    url: `https://example.com/places/${slug(name)}`,
    evidenceIds: ['e-' + slug(name)],
    durationMinutes: 60,
    walkingMinutes: 10,
    stepFree: true,
    diets: [],
    location: 'Kyoto, Japan',
    opensAt: '09:00',
    closesAt: '21:00',
    date: null,
    price: {
      amount: 100,
      currency: 'INR',
      unit: 'person',
      status: 'observed_generic',
      taxesIncluded: true,
    },
    gaps: [],
    source: 'Fetch',
    ...overrides,
  };
}
function evidence(candidates: Candidate[], ageDays = 0): Evidence[] {
  return candidates.map((c) => ({
    id: c.evidenceIds[0],
    url: c.url,
    title: c.name,
    excerpt: c.description,
    retrievedAt: new Date(NOW - ageDays * 86400000).toISOString(),
    category: c.category,
    source: c.source,
  }));
}
function trip(style: Partial<TravelStyle> = {}, input: Partial<typeof defaultInput> = {}) {
  return buildDraft(
    { ...defaultInput, destination: 'Kyoto, Japan', duration: 1, budget: '10000', ...input },
    { ...defaultStyle, pace: 'Balanced', ...style },
  );
}
const ids = (plan: ReturnType<typeof trip>) =>
  plan.days.flat().flatMap((item) => (item.candidateId ? [item.candidateId] : []));

test('BM25 matches interest synonyms and stays stable when candidate order changes', () => {
  const museum = candidate('City Museum', {
    description: 'Historic art collections and traditional crafts.',
  });
  const garden = candidate('Riverside Garden', {
    description: 'Botanical nature paths through forest and wildlife.',
  });
  const bar = candidate('Late Cocktail Bar', {
    description: 'Nightlife and a crowded dance floor.',
  });
  const choices = [museum, garden, bar],
    sources = evidence(choices),
    traveler = trip({ interests: ['Nature'] });
  const ranked = rankCandidates(choices, traveler, sources, NOW);
  assert.equal(ranked[0].id, garden.id);
  assert.deepEqual(ranked[0].ranking!.matchedInterests, ['Nature']);
  assert.deepEqual(
    rankCandidates([...choices].reverse(), traveler, sources, NOW).map((c) => c.id),
    ranked.map((c) => c.id),
  );
  assert.ok(
    ranked.every(
      (c) => Number.isFinite(c.ranking!.score) && c.ranking!.score >= 0 && c.ranking!.score <= 1,
    ),
  );
});

test('destination qualification rejects a restaurant named after the destination in another country', () => {
  const wrong = candidate('Kyoto Japanese Cuisine', {
    category: 'food',
    location: null,
    description: 'Authentic Japanese cuisine in Augusta, GA. Delivery and takeout.',
    url: 'https://kyotojapanesecuisinega.com/',
  });
  const real = candidate('Local Kyoto Table', {
    category: 'food',
    location: 'Kyoto, Japan',
    description: 'A local food tasting in Kyoto.',
  });
  const ambiguous = candidate('Kyoto Cuisine Listing', {
    category: 'food',
    location: null,
    description: 'Japanese food and culinary traditions.',
    url: 'https://example.com/dining',
  });
  const traveler = trip({ interests: ['Food'] });
  const sources = evidence([wrong, real, ambiguous]);
  assert.equal(destinationMatch(wrong, traveler, sources), 'mismatch');
  assert.equal(
    destinationMatch(
      { ...wrong, description: 'A local restaurant.', location: 'Tokyo, Japan' },
      traveler,
      sources,
    ),
    'unverified',
  );
  assert.equal(destinationMatch(real, traveler, sources), 'supported');
  assert.equal(destinationMatch(ambiguous, traveler, sources), 'unverified');
  const plan = schedule(traveler, [wrong, real, ambiguous], sources);
  assert.ok(ids(plan).includes(real.id));
  assert.ok(!ids(plan).includes(wrong.id));
  assert.ok(!ids(plan).includes(ambiguous.id));
});

test('a stated location naming the city qualifies a place even when no source names the country', () => {
  const traveler = trip({ interests: ['Temples'] });
  const local = candidate('Kiyomizu-dera', {
    location: 'Higashiyama, eastern Kyoto',
    description: 'A hillside temple with a wooden stage.',
    url: 'https://en.wikivoyage.org/wiki/Kyoto/Higashiyama',
  });
  const elsewhere = candidate('Kyoto Garden', {
    location: 'Kyoto Garden, Holland Park, London, United Kingdom',
  });
  const sources = evidence([local, elsewhere]);
  assert.equal(destinationMatch(local, traveler, sources), 'supported');
  assert.equal(destinationMatch(elsewhere, traveler, sources), 'mismatch');
  assert.ok(ids(schedule(traveler, [local], sources)).includes(local.id));
});
test('keyword repetition cannot outrank a direct, specific interest match', () => {
  const direct = candidate('Ancient Temple Shrine', {
    description: 'A Buddhist spiritual sanctuary with a temple courtyard.',
  });
  const repeated = candidate('Generic Listing', { description: 'temple '.repeat(500) });
  const result = rankCandidates(
    [direct, repeated],
    trip({ interests: ['Temples'] }),
    evidence([direct, repeated]),
    NOW,
  );
  assert.equal(result[0].id, direct.id);
});
test('practical evidence and retrieval freshness matter; API type alone gives no quality boost', () => {
  const detailed = candidate('Temple Alpha');
  const sparse = candidate('Temple Beta', {
    durationMinutes: null,
    walkingMinutes: null,
    stepFree: null,
    opensAt: null,
    closesAt: null,
    price: {
      amount: null,
      currency: 'INR',
      unit: 'unknown',
      status: 'unknown',
      taxesIncluded: null,
    },
  });
  const traveler = trip({ interests: ['Temples'] });
  const sources = evidence([detailed, sparse]);
  assert.equal(rankCandidates([sparse, detailed], traveler, sources, NOW)[0].id, detailed.id);
  const asAgent = rankCandidates([{ ...detailed, source: 'Agent' }], traveler, sources, NOW)[0];
  const asFetch = rankCandidates([{ ...detailed, source: 'Fetch' }], traveler, sources, NOW)[0];
  assert.equal(asAgent.ranking!.score, asFetch.ranking!.score);
  const stale = rankCandidates([detailed], traveler, evidence([detailed], 90), NOW)[0];
  assert.ok(stale.ranking!.score < asFetch.ranking!.score);
  assert.ok(stale.ranking!.caveats.some((note) => /Refresh/.test(note)));
});
test('unknown and foreign-currency prices are not treated as free', () => {
  const known = candidate('Museum Alpha');
  const unknown = candidate('Museum Beta', {
    price: {
      amount: null,
      currency: 'INR',
      unit: 'unknown',
      status: 'unknown',
      taxesIncluded: null,
    },
  });
  const traveler = trip();
  const ranked = rankCandidates([unknown, known], traveler, evidence([known, unknown]), NOW);
  assert.ok(
    ranked.find((c) => c.id === known.id)!.ranking!.components.budget >
      ranked.find((c) => c.id === unknown.id)!.ranking!.components.budget,
  );
  assert.equal(normalizedCost(unknown, traveler), null);
  assert.equal(
    normalizedCost({ ...known, price: { ...known.price, currency: 'JPY' } }, traveler),
    null,
  );
});
test('MMR covers different selected interests rather than repeating very similar museums', () => {
  const a = candidate('Art Museum Alpha', {
    description: 'Historic museum, art, culture, traditional exhibits and heritage.',
  });
  const b = candidate('Art Museum Beta', {
    description: 'Historic museum, art, culture, traditional exhibits and heritage.',
  });
  const garden = candidate('Botanical Forest Garden', {
    description: 'Nature, forest, botanical garden and wildlife.',
  });
  const choices = [a, b, garden];
  const result = diversifyCandidates(
    choices,
    trip({ interests: ['Culture', 'Nature'] }),
    evidence(choices),
    2,
    NOW,
  );
  assert.ok(result.some((c) => c.id === garden.id));
  assert.ok(result.some((c) => themes(c).has('Culture')));
  assert.ok(candidateSimilarity(a, b) > candidateSimilarity(a, garden));
});
test('entity deduplication removes tracking variants but retains meaningful query IDs', () => {
  const a = candidate('Temple Front', { url: 'https://example.com/detail?id=1&utm_source=a' });
  const duplicate = candidate('Temple Listing', {
    url: 'https://example.com/detail?utm_source=b&id=1',
  });
  const distinct = candidate('Different Garden', { url: 'https://example.com/detail?id=2' });
  assert.equal(canonicalUrl(a.url), canonicalUrl(duplicate.url));
  assert.equal(
    rankCandidates([a, duplicate, distinct], trip(), evidence([a, duplicate, distinct]), NOW)
      .length,
    2,
  );
});
test('reported neighborhoods and coordinates improve locality without inventing locations', () => {
  const previous = candidate('Museum Start', { location: 'Higashiyama, Kyoto' });
  const near = candidate('Garden Near', { location: 'Kyoto, Higashiyama' });
  const far = candidate('Garden Far', { location: 'Arashiyama, Kyoto' });
  const traveler = trip({ interests: ['Nature'] });
  const ranked = rankCandidates([near, far], traveler, evidence([near, far]), NOW);
  const nearScore = contextualRanking(
    ranked.find((c) => c.id === near.id)!,
    traveler,
    [previous],
    previous,
  );
  const farScore = contextualRanking(
    ranked.find((c) => c.id === far.id)!,
    traveler,
    [previous],
    previous,
  );
  assert.ok(nearScore.proximityBonus! > farScore.proximityBonus!);
  const unknown = rankCandidates([{ ...near, location: null }], traveler, evidence([near]), NOW)[0];
  assert.equal(contextualRanking(unknown, traveler, [], undefined).proximityBonus, 0);
  assert.equal(distanceKm(previous, far), null);
  assert.ok(
    distanceKm(
      { ...previous, coordinates: { latitude: 35, longitude: 135 } },
      { ...far, coordinates: { latitude: 35.001, longitude: 135.001 } },
    )! < 1,
  );
});
test('beam search preserves a morning-only visit for its unique time window', () => {
  const flexible = candidate('Temple Riverside Garden', {
    description: 'A peaceful temple, shrine and botanical forest garden.',
    closesAt: '18:00',
  });
  const morning = candidate('Historic Morning Shrine', {
    description: 'A historic temple and spiritual shrine.',
    closesAt: '11:00',
  });
  const traveler = trip({ interests: ['Temples', 'Nature'] });
  const plan = schedule(traveler, [flexible, morning], evidence([flexible, morning]));
  assert.equal(ids(plan).length, 2);
  assert.equal(
    plan.days[0].find((item) => item.time < '12:00' && item.candidateId)?.candidateId,
    morning.id,
  );
  assert.equal(
    plan.days[0].find((item) => item.time >= '16:00' && item.candidateId)?.candidateId,
    flexible.id,
  );
});
test('beam search prefers a feasible combination over one expensive early recommendation', () => {
  const premium = candidate('Premium Temple Museum', {
    description: 'A spiritual temple, historic art museum, shrine and culture.',
    price: {
      amount: 900,
      currency: 'INR',
      unit: 'person',
      status: 'observed_generic',
      taxesIncluded: true,
    },
  });
  const one = candidate('Historic Temple Alpha', { price: { ...premium.price, amount: 500 } });
  const two = candidate('Historic Temple Beta', { price: { ...premium.price, amount: 500 } });
  const choices = [premium, one, two];
  const plan = schedule(
    trip({ interests: ['Temples', 'Culture'] }, { budget: '1000' }),
    choices,
    evidence(choices),
  );
  assert.equal(ids(plan).length, 2);
  assert.ok(!ids(plan).includes(premium.id));
  assert.ok(plan.days.flat().reduce((sum, item) => sum + (item.cost || 0), 0) <= 1000);
});
test('a quiet low-walking vegetarian traveler and an active social traveler receive different plans', () => {
  const quiet = candidate('Quiet Temple Garden', {
    description: 'A peaceful spiritual shrine and tranquil botanical garden.',
    walkingMinutes: 10,
  });
  const hike = candidate('Social Forest Hike', {
    description: 'A group hiking trail through forest and nature.',
    durationMinutes: 180,
    walkingMinutes: 120,
  });
  const vegan = candidate('Vegetarian Garden Table', {
    category: 'food',
    description: 'Vegetarian restaurant and quiet food tasting.',
    diets: ['Vegetarian'],
    walkingMinutes: 5,
  });
  const meat = candidate('Shared Barbecue Table', {
    category: 'food',
    description: 'Social group cooking and cuisine.',
    diets: ['Nonvegetarian'],
    walkingMinutes: 5,
  });
  const choices = [quiet, hike, vegan, meat],
    sources = evidence(choices);
  const peaceful = schedule(
    trip({
      pace: 'Peaceful',
      atmosphere: 'Quiet spaces',
      walking: 'Minimal walking',
      food: 'Vegetarian',
      interests: ['Temples', 'Nature'],
    }),
    choices,
    sources,
  );
  const active = schedule(
    trip({
      pace: 'Packed',
      atmosphere: 'Meet people',
      walking: 'Hikes',
      food: 'Nonvegetarian',
      interests: ['Nature', 'Food'],
    }),
    choices,
    sources,
  );
  assert.ok(ids(peaceful).includes(quiet.id));
  assert.ok(ids(peaceful).includes(vegan.id));
  assert.ok(!ids(peaceful).includes(hike.id) && !ids(peaceful).includes(meat.id));
  assert.ok(ids(active).includes(hike.id));
  assert.notDeepEqual(ids(active), ids(peaceful));
});
test('re-optimizing reserves locked activities and locked rest before selecting new visits', () => {
  const booked = candidate('Booked Pottery Workshop', {
    description: 'A traditional craft workshop.',
    opensAt: '16:00',
    closesAt: '17:00',
  });
  const garden = candidate('New Botanical Garden', {
    description: 'A forest garden and nature visit.',
  });
  const traveler = trip({ interests: ['Nature'] });
  const locked = {
    ...traveler.days[0][3],
    id: 'booking',
    time: '16:00',
    endTime: '17:00',
    candidateId: booked.id,
    title: booked.name,
    locked: true,
  };
  const rest = { ...traveler.days[0][2], id: 'locked-rest', endTime: '15:00', locked: true };
  traveler.days[0][3] = locked;
  traveler.days[0][2] = rest;
  traveler.research = {
    jobId: 'job',
    status: 'partial',
    phase: 'done',
    events: [],
    evidence: evidence([booked, garden]),
    candidates: [booked, garden],
    gaps: [],
    updatedAt: new Date(NOW).toISOString(),
  };
  const plan = schedule(traveler, [booked, garden], traveler.research.evidence);
  assert.deepEqual(
    plan.days[0].find((item) => item.id === 'booking'),
    locked,
  );
  assert.deepEqual(
    plan.days[0].find((item) => item.id === 'locked-rest'),
    rest,
  );
  assert.equal(ids(plan).filter((id) => id === booked.id).length, 1);
  assert.ok(ids(plan).includes(garden.id));
});
test('dated events keep their actual start and arrival buffers allow a feasible shifted afternoon', () => {
  const event = candidate('Evening Cultural Performance', {
    category: 'event',
    date: '2030-01-07',
    opensAt: '18:30',
    closesAt: '19:30',
  });
  const traveler = trip(
    { interests: ['Culture'] },
    { dateMode: 'exact', startDate: '2030-01-07', endDate: '2030-01-07' },
  );
  const plan = schedule(traveler, [event], evidence([event]));
  const item = plan.days[0].find((item) => item.candidateId === event.id);
  assert.equal(item?.time, '18:30');
  assert.equal(item?.locked, true);
  const garden = candidate('Late Garden');
  const late = schedule(trip({}, { arrivalTime: '15:00' }), [garden], evidence([garden]));
  assert.equal(late.days[0].find((item) => item.candidateId === garden.id)?.time, '16:30');
});
test('an activity swap respects the next locked stop and does not repeat an existing venue', () => {
  const current = candidate('Current Temple');
  const next = candidate('Booked Garden');
  const duplicate = { ...next, id: 'duplicate-id', url: next.url + '?utm_campaign=copy' };
  const replacement = candidate('Short Museum', {
    durationMinutes: 45,
    location: 'Higashiyama, Kyoto, Japan',
  });
  const traveler = trip();
  traveler.days[0] = [
    { ...traveler.days[0][0], time: '10:00', endTime: '11:00', candidateId: current.id },
    { ...traveler.days[0][3], time: '12:00', endTime: '13:00', candidateId: next.id, locked: true },
  ];
  traveler.research = {
    jobId: 'j',
    status: 'partial',
    phase: 'done',
    events: [],
    evidence: evidence([current, next, duplicate, replacement]),
    candidates: [current, next, duplicate, replacement],
    gaps: [],
    updatedAt: new Date(NOW).toISOString(),
  };
  const changed = replaceItem(traveler, 0, traveler.days[0][0].id);
  assert.equal(changed?.days[0][0].candidateId, replacement.id);
  assert.deepEqual(changed?.days[0][1], traveler.days[0][1]);
});
test('retrying missing research preserves edited sourced items and their evidence IDs', () => {
  const old = candidate('Retained Temple');
  const fresh = candidate('Fresh Garden');
  const previous = trip();
  previous.days[0][0] = {
    ...previous.days[0][0],
    candidateId: old.id,
    evidenceIds: old.evidenceIds,
    verification: 'needs_confirmation',
    title: old.name,
    locked: true,
  };
  previous.days[0] = previous.days[0].filter((item) => item.time !== '16:00');
  previous.research = {
    jobId: 'j',
    status: 'partial',
    phase: 'done',
    events: [],
    evidence: evidence([old]),
    candidates: [old],
    gaps: [],
    updatedAt: new Date(NOW).toISOString(),
  };
  const planned = schedule(trip(), [fresh], evidence([fresh]));
  planned.research = { ...previous.research, candidates: [fresh], evidence: evidence([fresh]) };
  const merged = preserveResearchedPlan(previous, planned);
  assert.deepEqual(merged.days[0][0], previous.days[0][0]);
  assert.ok(merged.research!.candidates.some((c) => c.id === old.id));
  assert.ok(merged.research!.evidence.some((e) => e.id === old.evidenceIds[0]));
  assert.ok(!merged.days[0].some((item) => item.time === '16:00'));
});
