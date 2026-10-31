import type { Candidate, Evidence, RecommendationRanking } from '../src/lib/research.ts';
import { budgetTotal, tripDays, type Trip } from '../src/lib/planner.ts';

export const RANKING_VERSION = 'hybrid-v1' as const;
export const RANKING_WEIGHTS = Object.freeze({
  interests: 0.4,
  atmosphere: 0.1,
  pace: 0.1,
  evidence: 0.18,
  freshness: 0.07,
  budget: 0.15,
});
export const BEAM_WIDTH = 20;
export const MAX_BRANCHES = 12;
export function destinationMatch(
  candidate: Candidate,
  trip: Trip,
  evidence: Evidence[],
): 'supported' | 'unverified' | 'mismatch' {
  if (candidate.category === 'transport') return 'supported';
  const pieces = trip.input.destination.split(',').map((value) => value.trim());
  const city = pieces[0];
  const known: Record<string, string> = {
    kyoto: 'Japan',
    bali: 'Indonesia',
    varkala: 'India',
    jaipur: 'India',
    'ninh binh': 'Vietnam',
    interlaken: 'Switzerland',
  };
  const country = pieces.length > 1 ? pieces.at(-1)! : known[city.toLowerCase()] || '';
  const definitions: [string[], string][] = [
    [['Japan', 'JP'], 'jp'],
    [['India', 'IN'], 'in'],
    [['Indonesia', 'ID'], 'id'],
    [['Vietnam', 'Viet Nam', 'VN'], 'vn'],
    [['Switzerland', 'CH'], 'ch'],
    [['United States', 'USA', 'US', 'United States of America'], 'us'],
    [['United Kingdom', 'UK', 'Britain', 'GB'], 'uk'],
    [['France', 'FR'], 'fr'],
    [['Italy', 'IT'], 'it'],
    [['Thailand', 'TH'], 'th'],
    [['Spain', 'ES'], 'es'],
    [['Australia', 'AU'], 'au'],
    [['Canada', 'CA'], 'ca'],
    [['Germany', 'DE'], 'de'],
    [['Singapore', 'SG'], 'sg'],
  ];
  const definition = definitions.find(([names]) =>
    names.some((name) => name.toLowerCase() === country.toLowerCase()),
  );
  const names = (definition?.[0] || [country]).filter((name) => name.length > 2);
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const has = (text: string, value: string) =>
    new RegExp(`(?:^|[^\\p{L}])${escape(value)}(?:$|[^\\p{L}])`, 'iu').test(text);
  const locality = (candidate.location || '') + ' ' + candidate.description;
  const usAddress =
    /\b[A-Z][A-Za-z ]{1,30},\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/.test(
      locality,
    );
  const expectsUs = definition?.[1] === 'us';
  if (country && !expectsUs && usAddress) return 'mismatch';
  if (candidate.location && definition) {
    const other = definitions.find(([aliases]) =>
      aliases.filter((alias) => alias.length > 3).some((alias) => has(candidate.location!, alias)),
    );
    if (other && other[1] !== definition[1]) return 'mismatch';
  }
  const sources = evidence.filter((source) => candidate.evidenceIds.includes(source.id));
  const context = [
    candidate.location || '',
    candidate.name,
    candidate.description,
    ...sources.map((source) => source.title + ' ' + source.excerpt + ' ' + source.url),
  ].join(' ');
  const cityMatch = has(context, city);
  if (candidate.location && !has(candidate.location, city)) return 'unverified';
  // A source-stated location that names the city is enough once the checks above found no
  // other country or US address in it. Local guides often never repeat the country name.
  if (candidate.location && definition) return 'supported';
  const countryMatch =
    !country ||
    names.some((name) => has(context, name)) ||
    (definition &&
      sources.some((source) => {
        try {
          return new URL(source.url).hostname.endsWith('.' + definition[1]);
        } catch {
          return false;
        }
      })) ||
    (expectsUs && usAddress);
  return cityMatch && countryMatch ? 'supported' : 'unverified';
}
const synonyms: Record<string, string[]> = {
  Nature: [
    'nature',
    'garden',
    'forest',
    'park',
    'lake',
    'waterfall',
    'wildlife',
    'botanical',
    'river',
  ],
  Culture: ['culture', 'museum', 'heritage', 'history', 'historic', 'traditional', 'art', 'craft'],
  Temples: ['temple', 'shrine', 'buddhist', 'spiritual', 'sanctuary'],
  Food: ['food', 'restaurant', 'culinary', 'cooking', 'cuisine', 'tasting', 'streetfood'],
  Beaches: ['beach', 'seaside', 'sand', 'coast', 'coastal', 'surf', 'shore'],
  Photography: [
    'photography',
    'photograph',
    'scenic',
    'panorama',
    'panoramic',
    'viewpoint',
    'sunrise',
    'sunset',
  ],
  Wellness: ['wellness', 'spa', 'yoga', 'meditation', 'onsen', 'relaxation', 'retreat'],
  Nightlife: ['nightlife', 'nightclub', 'cocktail', 'bar', 'music', 'jazz', 'evening'],
  Shopping: ['shopping', 'shop', 'market', 'boutique', 'artisan', 'souvenir', 'bazaar'],
};
const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'with',
  'your',
  'our',
  'you',
  'visit',
  'official',
  'website',
  'page',
  'travel',
  'trip',
]);
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
function stem(token: string) {
  if (token.endsWith('ies') && token.length > 5) return token.slice(0, -3) + 'y';
  if (token.endsWith('ches')) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}
export function tokens(text: string): string[] {
  return (
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || []
  )
    .map(stem)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}
const tokenSet = (text: string) => new Set(tokens(text));
const aliases = new Map(
  Object.entries(synonyms).map(([key, value]) => [key, new Set(value.flatMap(tokens))]),
);
const featureCache = new WeakMap<
  Candidate,
  { terms: Set<string>; themes: Set<string>; url: string; name: string }
>();
function features(candidate: Candidate) {
  let value = featureCache.get(candidate);
  if (value) return value;
  const terms = tokenSet(docText(candidate));
  value = {
    terms,
    themes: new Set(
      [...aliases]
        .filter(([, words]) => [...words].some((word) => terms.has(word)))
        .map(([key]) => key),
    ),
    url: canonicalUrl(candidate.url),
    name: tokens(candidate.name).join(' '),
  };
  featureCache.set(candidate, value);
  return value;
}
function docText(candidate: Candidate) {
  return `${candidate.name} ${candidate.name} ${candidate.description.slice(0, 2500)}`;
}
function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const term of a) if (b.has(term)) common++;
  return common / (a.size + b.size - common);
}
export function themes(candidate: Candidate): Set<string> {
  return features(candidate).themes;
}
export function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(?:fbclid|gclid|ref|source|sid|session_id|affiliate|aid|label)$/i.test(key))
        url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch {
    return value;
  }
}
export function entityName(candidate: Candidate) {
  return features(candidate).name;
}
export function sameEntity(a: Candidate, b: Candidate) {
  const left = features(a),
    right = features(b);
  return left.url === right.url || (!!left.name && left.name === right.name);
}
export function deduplicateCandidates(
  candidates: Candidate[],
  evidence: Evidence[] = [],
): Candidate[] {
  const completeness = (candidate: Candidate) =>
    candidate.evidenceIds.filter((id) => evidence.some((e) => e.id === id)).length +
    Number(candidate.durationMinutes !== null) +
    Number(candidate.walkingMinutes !== null) +
    Number(candidate.price.amount !== null) +
    Number(candidate.opensAt !== null) +
    Number(candidate.location !== null);
  const ordered = [...candidates].sort(
    (a, b) =>
      completeness(b) - completeness(a) ||
      canonicalUrl(a.url).localeCompare(canonicalUrl(b.url)) ||
      a.name.localeCompare(b.name),
  );
  const unique: Candidate[] = [];
  for (const candidate of ordered) {
    if (!unique.some((prior) => sameEntity(candidate, prior))) unique.push(candidate);
  }
  return unique;
}
export function normalizedCost(candidate: Candidate, trip: Trip): number | null {
  const price = candidate.price;
  if (
    price.amount === null ||
    !Number.isFinite(price.amount) ||
    price.amount < 0 ||
    price.currency !== trip.input.currency ||
    price.unit === 'unknown'
  )
    return null;
  if (price.unit === 'person') return price.amount * trip.input.travelers;
  if (price.unit === 'room_night')
    return price.amount * (trip.input.rooms || 1) * Math.max(0, tripDays(trip.input) - 1);
  return price.amount;
}
function bm25(candidates: Candidate[], trip: Trip): Map<string, number> {
  const documents = candidates.map((candidate) => tokens(docText(candidate)));
  const average =
    documents.reduce((sum, terms) => sum + terms.length, 0) / Math.max(1, documents.length) || 1;
  const df = new Map<string, number>();
  for (const terms of documents)
    for (const term of new Set(terms)) df.set(term, (df.get(term) || 0) + 1);
  const query = new Map<string, number>();
  for (const interest of [...new Set(trip.style.interests)]) {
    const words = aliases.get(interest) || tokenSet(interest);
    for (const word of words) query.set(word, (query.get(word) || 0) + 1 / words.size);
  }
  const raw = candidates.map((candidate, index) => {
    const terms = documents[index];
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, Math.min(4, (tf.get(term) || 0) + 1));
    let score = 0;
    for (const [term, weight] of query) {
      const frequency = tf.get(term) || 0;
      if (!frequency) continue;
      const count = df.get(term) || 0;
      const idf = Math.log(1 + (candidates.length - count + 0.5) / (count + 0.5));
      score +=
        (weight * idf * (frequency * 2.2)) /
        (frequency + 1.2 * (0.25 + (0.75 * terms.length) / average));
    }
    return { id: candidate.id, score };
  });
  const max = Math.max(0, ...raw.map((row) => row.score));
  return new Map(raw.map((row) => [row.id, max ? row.score / max : 0]));
}
function evidenceScore(candidate: Candidate, evidence: Evidence[]) {
  const sources = evidence.filter((item) => candidate.evidenceIds.includes(item.id));
  if (!sources.length) return 0.1;
  const domains = new Set(
    sources.flatMap((source) => {
      try {
        return [new URL(source.url).hostname];
      } catch {
        return [];
      }
    }),
  );
  const facts = [
    candidate.durationMinutes !== null,
    candidate.walkingMinutes !== null,
    candidate.stepFree !== null,
    candidate.opensAt !== null,
    candidate.closesAt !== null,
    candidate.location !== null,
    candidate.price.amount !== null && candidate.price.unit !== 'unknown',
  ];
  return clamp(
    0.4 +
      (0.5 * facts.filter(Boolean).length) / facts.length +
      0.1 * Math.min(1, Math.max(0, domains.size - 1)),
  );
}
function freshnessScore(candidate: Candidate, evidence: Evidence[], now: number) {
  const dates = evidence
    .filter((e) => candidate.evidenceIds.includes(e.id))
    .map((e) => Date.parse(e.retrievedAt))
    .filter((date) => Number.isFinite(date) && date <= now + 300000);
  if (!dates.length) return 0.25;
  const age = Math.max(0, now - Math.max(...dates)) / 86400000;
  const halfLife = candidate.category === 'attraction' ? 14 : 2;
  return Math.pow(0.5, age / halfLife);
}
function atmosphereScore(candidate: Candidate, trip: Trip) {
  const words = tokenSet(docText(candidate));
  const has = (terms: string[]) => terms.some((term) => words.has(stem(term)));
  if (!trip.style.atmosphere || trip.style.atmosphere === 'A mix') return 0.5;
  const quiet = has(['quiet', 'peaceful', 'tranquil', 'serene', 'secluded']);
  const social = has(['group', 'workshop', 'class', 'community', 'social', 'nightclub', 'crowded']);
  return trip.style.atmosphere === 'Quiet spaces'
    ? quiet
      ? 1
      : social
        ? 0.15
        : 0.5
    : social
      ? 1
      : quiet
        ? 0.35
        : 0.5;
}
function paceScore(candidate: Candidate, trip: Trip) {
  const duration = candidate.durationMinutes;
  let score =
    duration === null
      ? 0.35
      : trip.style.pace === 'Peaceful'
        ? duration <= 90
          ? 1
          : duration <= 150
            ? 0.65
            : 0.3
        : trip.style.pace === 'Packed'
          ? duration <= 90
            ? 1
            : duration <= 150
              ? 0.7
              : 0.4
          : duration <= 150
            ? 0.9
            : 0.65;
  if (trip.style.walking === 'Hikes' && /hike|hiking|trek|trail/i.test(docText(candidate)))
    score = Math.min(1, score + 0.2);
  if (
    trip.style.walking === 'Long walks' &&
    candidate.walkingMinutes !== null &&
    candidate.walkingMinutes >= 45
  )
    score = Math.min(1, score + 0.1);
  return score;
}
export function rankCandidates(
  candidates: Candidate[],
  trip: Trip,
  evidence: Evidence[],
  asOf = Date.now(),
): Candidate[] {
  const unique = deduplicateCandidates(
    candidates.filter((candidate) => destinationMatch(candidate, trip, evidence) !== 'mismatch'),
    evidence,
  );
  const scores = bm25(unique, trip);
  const interests = [...new Set(trip.style.interests)];
  return unique
    .map((candidate) => {
      const matched = interests.filter((interest) => themes(candidate).has(interest));
      const relevance = interests.length
        ? 0.65 * (scores.get(candidate.id) || 0) + (0.35 * matched.length) / interests.length
        : 0.5;
      const cost = normalizedCost(candidate, trip);
      const allocation =
        budgetTotal(trip.input) *
        (candidate.category === 'stay'
          ? 0.45
          : candidate.category === 'transport'
            ? 0.2
            : 1 / Math.max(1, tripDays(trip.input) * 3));
      const budget = cost === null ? 0.3 : 1 / (1 + cost / Math.max(1, allocation));
      const components = {
        interests: clamp(relevance),
        atmosphere: atmosphereScore(candidate, trip),
        pace: paceScore(candidate, trip),
        evidence: evidenceScore(candidate, evidence),
        freshness: freshnessScore(candidate, evidence, asOf),
        budget,
      };
      const score = (Object.keys(RANKING_WEIGHTS) as (keyof typeof RANKING_WEIGHTS)[]).reduce(
        (sum, key) => sum + components[key] * RANKING_WEIGHTS[key],
        0,
      );
      const reasons: string[] = [];
      const caveats: string[] = [];
      if (destinationMatch(candidate, trip, evidence) === 'unverified')
        caveats.push(
          'The source does not establish this place in the selected destination; it is not scheduled.',
        );
      if (matched.length)
        reasons.push(
          `Matches your ${matched.map((x) => x.toLowerCase()).join(' and ')} interests.`,
        );
      if (components.atmosphere === 1)
        reasons.push(
          trip.style.atmosphere === 'Quiet spaces'
            ? 'The source describes a quiet setting.'
            : 'The source describes a shared or social experience.',
        );
      if (candidate.durationMinutes !== null)
        reasons.push(`The source reports a ${candidate.durationMinutes}-minute visit.`);
      if (components.evidence >= 0.7)
        reasons.push('The source provides several practical visit details.');
      if (cost !== null)
        reasons.push('The listed price has a comparable currency and party basis.');
      else caveats.push('A comparable total price is not known.');
      if (candidate.walkingMinutes === null) caveats.push('Walking effort needs confirmation.');
      if (candidate.opensAt === null || candidate.closesAt === null)
        caveats.push('Opening hours need confirmation.');
      if (components.freshness < 0.5)
        caveats.push('Refresh the source before relying on time-sensitive details.');
      if (candidate.price.status === 'observed_generic')
        caveats.push('The listed price is generic; recheck your dates.');
      if (!reasons.length)
        reasons.push(
          'A researched option for this destination, subject to the listed verification gaps.',
        );
      return {
        ...candidate,
        ranking: {
          version: RANKING_VERSION,
          score: clamp(score),
          components,
          matchedInterests: matched,
          reasons,
          caveats,
        } satisfies RecommendationRanking,
      };
    })
    .sort(
      (a, b) =>
        b.ranking!.score - a.ranking!.score ||
        canonicalUrl(a.url).localeCompare(canonicalUrl(b.url)) ||
        a.name.localeCompare(b.name),
    );
}
export function candidateSimilarity(a: Candidate, b: Candidate): number {
  if (sameEntity(a, b)) return 1;
  if (a.category !== b.category) return 0.1 * jaccard(features(a).terms, features(b).terms);
  return 0.6 * jaccard(themes(a), themes(b)) + 0.4 * jaccard(features(a).terms, features(b).terms);
}
export function distanceKm(a: Candidate, b: Candidate): number | null {
  const valid = (point: Candidate['coordinates']) =>
    !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
  if (!valid(a.coordinates) || !valid(b.coordinates)) return null;
  const rad = (value: number) => (value * Math.PI) / 180;
  const one = a.coordinates!,
    two = b.coordinates!;
  const dLat = rad(two.latitude - one.latitude),
    dLon = rad(two.longitude - one.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(one.latitude)) * Math.cos(rad(two.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(clamp(value)));
}
export function locationAffinity(a: Candidate | undefined, b: Candidate, trip: Trip): number {
  if (!a) return 0;
  const distance = distanceKm(a, b);
  if (distance !== null) return Math.exp(-distance / 5);
  if (!a.location || !b.location) return 0;
  const destination = tokenSet(trip.input.destination);
  const area = (value: string) =>
    new Set(
      tokens(value).filter(
        (term) =>
          !destination.has(term) &&
          ![
            'district',
            'ward',
            'city',
            'prefecture',
            'japan',
            'india',
            'indonesia',
            'vietnam',
            'switzerland',
          ].includes(term),
      ),
    );
  return jaccard(area(a.location), area(b.location));
}
export function contextualRanking(
  candidate: Candidate,
  trip: Trip,
  selected: Candidate[],
  previousStop?: Candidate,
): RecommendationRanking {
  const base = candidate.ranking!;
  const lambda = trip.style.interests.length > 1 ? 0.78 : 0.9;
  const similarity = Math.max(
    0,
    ...selected
      .filter((c) => c.category === candidate.category)
      .map((other) => candidateSimilarity(candidate, other)),
  );
  const diversityPenalty = (1 - lambda) * similarity;
  const proximityBonus = 0.08 * locationAffinity(previousStop, candidate, trip);
  const covered = new Set(selected.flatMap((c) => c.ranking?.matchedInterests || []));
  const newThemes = base.matchedInterests.filter((theme) => !covered.has(theme));
  const novelty = (0.06 * newThemes.length) / Math.max(1, trip.style.interests.length);
  const reasons = [...base.reasons];
  if (previousStop && proximityBonus >= 0.035)
    reasons.push('Keeps this part of the day near your previous reported location.');
  if (selected.some((c) => c.category === candidate.category) && newThemes.length)
    reasons.push(
      `Adds ${newThemes.map((x) => x.toLowerCase()).join(' and ')} to your mix of experiences.`,
    );
  return {
    ...base,
    score: clamp(lambda * base.score - diversityPenalty + proximityBonus + novelty),
    diversityPenalty,
    proximityBonus,
    reasons,
  };
}
export function diversifyCandidates(
  candidates: Candidate[],
  trip: Trip,
  evidence: Evidence[],
  limit = candidates.length,
  asOf = Date.now(),
): Candidate[] {
  const remaining = rankCandidates(candidates, trip, evidence, asOf);
  const selected: Candidate[] = [];
  while (remaining.length && selected.length < limit) {
    const ordered = remaining
      .map((candidate) => ({ ...candidate, ranking: contextualRanking(candidate, trip, selected) }))
      .sort(
        (a, b) =>
          b.ranking.score - a.ranking.score ||
          canonicalUrl(a.url).localeCompare(canonicalUrl(b.url)),
      );
    const next = ordered[0];
    selected.push(next);
    remaining.splice(
      remaining.findIndex((c) => c.id === next.id),
      1,
    );
  }
  return selected;
}
