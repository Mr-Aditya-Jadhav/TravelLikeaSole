import type { Candidate, Evidence, RecommendationRanking } from '../src/lib/research.ts';
import {
  budgetTotal,
  tripDays,
  type Trip,
  type PlanItem,
  type TravelStyle,
} from '../src/lib/planner.ts';
import { id } from './store.ts';
import {
  BEAM_WIDTH,
  MAX_BRANCHES,
  canonicalUrl,
  contextualRanking,
  distanceKm,
  normalizedCost,
  rankCandidates,
  sameEntity,
  destinationMatch,
} from './ranking.ts';

export const candidateCost = normalizedCost;
export function eligible(candidate: Candidate, style: TravelStyle): boolean {
  if (
    /\b(?:avoid|exclude|never|must|require|only|allerg\w*)\b|\bdo not\b|\bdon't\b|\bno (?!preference)/i.test(
      style.notes,
    )
  )
    return false;
  if (
    candidate.category === 'food' &&
    style.food &&
    !['No preference', 'Flexible', 'Nonvegetarian'].includes(style.food) &&
    !candidate.diets.some((x) => x.toLowerCase() === style.food.toLowerCase())
  )
    return false;
  if (
    ['Minimal walking', 'Easy walks'].includes(style.walking) &&
    /hike|trek|strenuous|mountain climb/i.test(candidate.name + ' ' + candidate.description)
  )
    return false;
  if (
    style.walking === 'Minimal walking' &&
    (candidate.walkingMinutes === null || candidate.walkingMinutes > 15)
  )
    return false;
  if (
    style.walking === 'Easy walks' &&
    (candidate.walkingMinutes === null || candidate.walkingMinutes > 45)
  )
    return false;
  if (
    /step.free|no stairs|avoid stairs|wheelchair/i.test(style.restrictions) &&
    candidate.stepFree !== true
  )
    return false;
  const walkingLimit = style.restrictions.match(
    /(?:max(?:imum)?|limit|no more than|up to)?\s*(\d+)\s*(?:-| )?min(?:ute)?(?:s)?\s*(?:walk|walking)/i,
  );
  if (
    walkingLimit &&
    (candidate.walkingMinutes === null || candidate.walkingMinutes > Number(walkingLimit[1]))
  )
    return false;
  // Allergies and arbitrary exclusions require venue confirmation; do not claim inferred safety.
  if (style.restrictions.trim()) return false;
  return true;
}

export function rank(candidate: Candidate, trip: Trip): number {
  const pool = trip.research?.candidates || [candidate];
  return (
    rankCandidates(
      pool.some((c) => c.id === candidate.id) ? pool : [...pool, candidate],
      trip,
      trip.research?.evidence || [],
    ).find((c) => c.id === candidate.id)?.ranking?.score || 0
  );
}
const minutes = (time: string | null | undefined) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')
    ? Number(time!.slice(0, 2)) * 60 + Number(time!.slice(3))
    : null;
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const dateFor = (trip: Trip, day: number) =>
  trip.input.dateMode === 'exact'
    ? new Date(Date.parse(trip.input.startDate + 'T00:00:00Z') + day * 86400000)
        .toISOString()
        .slice(0, 10)
    : undefined;
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
function closedOn(candidate: Candidate, date: string | undefined, evidence: Evidence[]): boolean {
  if (!date) return false;
  const weekday = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return evidence
    .filter((e) => candidate.evidenceIds.includes(e.id))
    .some((e) => new RegExp(`closed\\s+(?:on\\s+)?${weekday}`, 'i').test(e.excerpt));
}
function duration(candidate: Candidate): number {
  const open = minutes(candidate.opensAt),
    close = minutes(candidate.closesAt);
  return (
    candidate.durationMinutes ||
    (candidate.category === 'event' && open !== null && close !== null && close > open
      ? close - open
      : 60)
  );
}
function windowFor(trip: Trip, day: number) {
  const arrival = day === 0 ? minutes(trip.input.arrivalTime) : null;
  const departure = day === tripDays(trip.input) - 1 ? minutes(trip.input.departureTime) : null;
  return {
    start: arrival === null ? 0 : arrival + 90,
    end: departure === null ? 1440 : Math.max(0, departure - 90),
  };
}
function restFor(trip: Trip, day: number) {
  const window = windowFor(trip, day);
  return {
    start: Math.max(855, window.start),
    end: Math.min(trip.style.pace === 'Peaceful' ? 1020 : 915, window.end),
  };
}
type Slot = {
  day: number;
  start: number;
  end: number;
  type: 'discover' | 'food';
  eventId?: string;
};
type Choice = {
  slot: Slot;
  candidate: Candidate;
  start: number;
  end: number;
  transfer: number;
  transferNote: string;
  ranking: RecommendationRanking;
  original?: PlanItem;
};
type State = { choices: Choice[]; spent: number; utility: number; signature: string };
function transferBetween(previous: Candidate | undefined, next: Candidate) {
  if (!previous)
    return { minutes: 0, note: 'First proposed stop; confirm your arrival and route.' };
  const distance = distanceKm(previous, next);
  return {
    minutes: distance === null ? 30 : Math.max(30, Math.ceil((distance / 35) * 60) + 10),
    note:
      distance === null
        ? '30-minute transfer allowance; confirm the actual route.'
        : 'Transfer allowance estimated from source-reported coordinates and assumed local transport; confirm the actual route.',
  };
}
function slotsFor(trip: Trip, candidates: Candidate[]): Slot[] {
  const slots: Slot[] = [];
  for (let day = 0; day < tripDays(trip.input); day++) {
    const hiking = trip.style.walking === 'Hikes';
    slots.push(
      {
        day,
        start: hiking ? 510 : trip.style.pace === 'Peaceful' ? 600 : 570,
        end: 750,
        type: 'discover',
      },
      { day, start: 780, end: 840, type: 'food' },
    );
    if (
      trip.style.pace !== 'Peaceful' &&
      (!trip.style.interests.includes('Nightlife') || trip.style.pace === 'Packed')
    )
      slots.push({ day, start: 960, end: 1080, type: 'discover' });
    if (trip.style.pace === 'Packed' || trip.style.interests.includes('Nightlife'))
      slots.push({ day, start: 1140, end: 1260, type: 'discover' });
    const date = dateFor(trip, day);
    for (const event of candidates
      .filter(
        (c) => c.category === 'event' && c.date === date && date && minutes(c.opensAt) !== null,
      )
      .slice(0, 3)) {
      const start = minutes(event.opensAt)!;
      slots.push({ day, start, end: start + duration(event), type: 'discover', eventId: event.id });
    }
  }
  return slots.sort(
    (a, b) =>
      a.day - b.day ||
      a.start - b.start ||
      Number(!!b.eventId) - Number(!!a.eventId) ||
      (a.eventId || '').localeCompare(b.eventId || ''),
  );
}
type LockedBlock = { day: number; start: number; end: number; item: PlanItem };
function feasible(
  candidate: Candidate,
  slot: Slot,
  state: State,
  trip: Trip,
  evidence: Evidence[],
  lockedBlocks: LockedBlock[] = [],
): Choice | null {
  if (slot.eventId ? candidate.id !== slot.eventId : candidate.category === 'event') return null;
  if ((slot.type === 'food') !== (candidate.category === 'food')) return null;
  if (state.choices.some((choice) => sameEntity(choice.candidate, candidate))) return null;
  if (closedOn(candidate, dateFor(trip, slot.day), evidence)) return null;
  const sameDay = state.choices
    .filter((choice) => choice.slot.day === slot.day)
    .sort((a, b) => a.start - b.start);
  const window = windowFor(trip, slot.day),
    open = minutes(candidate.opensAt),
    close = minutes(candidate.closesAt),
    rest = restFor(trip, slot.day);
  const cost = normalizedCost(candidate, trip);
  if (cost !== null && state.spent + cost > budgetTotal(trip.input)) return null;
  const walking =
    sameDay.reduce((total, choice) => total + (choice.candidate.walkingMinutes || 0), 0) +
    (candidate.walkingMinutes || 0);
  if (
    (trip.style.walking === 'Minimal walking' && walking > 30) ||
    (trip.style.walking === 'Easy walks' && walking > 90)
  )
    return null;
  const earliest = Math.max(slot.start, window.start, open || 0);
  const starts = slot.eventId
    ? [minutes(candidate.opensAt)!]
    : [
        ...new Set([
          earliest,
          ...sameDay.map((previous) =>
            Math.max(
              earliest,
              previous.end + transferBetween(previous.candidate, candidate).minutes,
            ),
          ),
        ]),
      ].sort((a, b) => a - b);
  for (const start of starts) {
    const end = start + duration(candidate);
    if (
      start < earliest ||
      end > slot.end ||
      end > window.end ||
      (close !== null && end > close) ||
      (rest.end > rest.start && overlaps(start, end, rest.start, rest.end))
    )
      continue;
    if (
      sameDay.some((choice) => overlaps(start, end, choice.start, choice.end)) ||
      lockedBlocks.some(
        (block) => block.day === slot.day && overlaps(start, end, block.start, block.end),
      )
    )
      continue;
    if (
      start < 1020 &&
      /nightclub|nightlife|cocktail bar|jazz bar/i.test(
        candidate.name + ' ' + candidate.description,
      )
    )
      continue;
    const previous = sameDay.filter((choice) => choice.end <= start).at(-1);
    const next = sameDay.find((choice) => choice.start >= end);
    const transfer = transferBetween(previous?.candidate, candidate);
    if (previous && previous.end + transfer.minutes > start) continue;
    if (next && end + transferBetween(candidate, next.candidate).minutes > next.start) continue;
    const ranking = contextualRanking(
      candidate,
      trip,
      state.choices.map((choice) => choice.candidate),
      previous?.candidate,
    );
    return {
      slot,
      candidate,
      start,
      end,
      transfer: transfer.minutes,
      transferNote: transfer.note,
      ranking,
    };
  }
  return null;
}
function compareStates(a: State, b: State) {
  return (
    b.utility - a.utility ||
    b.choices.length - a.choices.length ||
    a.spent - b.spent ||
    a.signature.localeCompare(b.signature)
  );
}
function toItem(choice: Choice, trip: Trip): PlanItem {
  if (choice.original) return structuredClone(choice.original);
  const { candidate, ranking } = choice;
  return {
    id: id(),
    time: clock(choice.start),
    endTime: clock(choice.end),
    title: candidate.name,
    description: candidate.description,
    type: choice.slot.type,
    effort:
      candidate.walkingMinutes === null
        ? 'Walking requirements unverified'
        : `${candidate.walkingMinutes} min walking reported`,
    locked: candidate.category === 'event',
    alternate: false,
    candidateId: candidate.id,
    evidenceIds: candidate.evidenceIds,
    verification: 'needs_confirmation',
    transferMinutes: choice.transfer,
    transferNote: choice.transferNote,
    fitReason: ranking.reasons.slice(0, 2).join(' '),
    ranking,
    cost: normalizedCost(candidate, trip),
  };
}
function placeholder(slot: Slot, trip: Trip): PlanItem {
  const window = windowFor(trip, slot.day);
  return {
    id: id(),
    time: clock(Math.max(slot.start, window.start)),
    endTime: clock(Math.min(slot.end, window.end)),
    title:
      slot.type === 'food'
        ? trip.style.food
          ? `${trip.style.food} lunch · choose a suitable place`
          : 'Lunch at your own pace'
        : 'Room for a suitable local discovery',
    description: trip.style.restrictions
      ? `No researched option could be confirmed against your requirements: ${trip.style.restrictions}. Keep this time open until a venue confirms them.`
      : 'No additional suitable, non-repeating option was confirmed. Explore the researched alternatives or keep this time free.',
    type: slot.type,
    effort: 'No activity confirmed',
    locked: false,
    alternate: false,
    verification: 'unresearched',
    cost: null,
  };
}
export function schedule(trip: Trip, candidates: Candidate[], evidence: Evidence[]): Trip {
  const allRanked = rankCandidates(candidates, trip, evidence);
  const ranked = allRanked.filter(
    (c) =>
      ['attraction', 'food', 'event'].includes(c.category) &&
      eligible(c, trip.style) &&
      destinationMatch(c, trip, evidence) === 'supported',
  );
  const lockedChoices: Choice[] = [];
  const lockedBlocks: LockedBlock[] = [];
  trip.days.forEach((items, day) =>
    items
      .filter((item) => item.locked)
      .forEach((item) => {
        const start = minutes(item.time);
        if (start === null) return;
        const end = minutes(item.endTime) || start + 60;
        const original = (trip.research?.candidates || candidates).find(
          (c) => c.id === item.candidateId,
        );
        const candidate = original
          ? {
              ...original,
              ranking:
                allRanked.find((c) => sameEntity(c, original))?.ranking ||
                rankCandidates([original], trip, evidence)[0]?.ranking,
            }
          : undefined;
        if (candidate && item.type !== 'rest')
          lockedChoices.push({
            slot: { day, start, end, type: item.type },
            candidate,
            start,
            end,
            transfer: item.transferMinutes || 0,
            transferNote: item.transferNote || 'Confirm the route to this locked stop.',
            ranking: candidate.ranking!,
            original: item,
          });
        else lockedBlocks.push({ day, start, end, item });
      }),
  );
  const slots = slotsFor(trip, ranked);
  let beam: State[] = [
    {
      choices: lockedChoices,
      spent: trip.days
        .flat()
        .filter((item) => item.locked)
        .reduce((sum, item) => sum + (item.cost || 0), 0),
      utility: 0,
      signature: 'locked',
    },
  ];
  for (const slot of slots) {
    const expanded: State[] = [];
    for (const state of beam) {
      expanded.push(state); // Leaving a slot open can preserve a better later combination.
      const choices = ranked
        .flatMap((candidate) => {
          const choice = feasible(candidate, slot, state, trip, evidence, lockedBlocks);
          return choice ? [choice] : [];
        })
        .sort(
          (a, b) =>
            b.ranking.score - a.ranking.score ||
            canonicalUrl(a.candidate.url).localeCompare(canonicalUrl(b.candidate.url)),
        )
        .slice(0, MAX_BRANCHES);
      for (const choice of choices)
        expanded.push({
          choices: [...state.choices, choice],
          spent: state.spent + (normalizedCost(choice.candidate, trip) || 0),
          utility: state.utility + choice.ranking.score + 0.12,
          signature:
            state.signature + `|${slot.day}:${choice.start}:${canonicalUrl(choice.candidate.url)}`,
        });
    }
    const seen = new Set<string>();
    beam = expanded
      .sort(compareStates)
      .filter((state) => {
        if (seen.has(state.signature)) return false;
        seen.add(state.signature);
        return true;
      })
      .slice(0, BEAM_WIDTH);
  }
  const best = beam[0];
  const days: PlanItem[][] = Array.from({ length: tripDays(trip.input) }, (_, day) => {
    const choices = best.choices.filter((choice) => choice.slot.day === day);
    const items = [
      ...choices.map((choice) => toItem(choice, trip)),
      ...lockedBlocks
        .filter((block) => block.day === day)
        .map((block) => structuredClone(block.item)),
    ];
    const window = windowFor(trip, day);
    for (const slot of slots.filter((slot) => slot.day === day && !slot.eventId)) {
      const start = Math.max(slot.start, window.start),
        end = Math.min(slot.end, window.end);
      if (
        end <= start ||
        items.some((item) =>
          overlaps(
            start,
            end,
            minutes(item.time)!,
            minutes(item.endTime) || minutes(item.time)! + 60,
          ),
        )
      )
        continue;
      items.push(placeholder(slot, trip));
    }
    const rest = restFor(trip, day);
    if (
      rest.end > rest.start &&
      !items.some((item) =>
        overlaps(
          rest.start,
          rest.end,
          minutes(item.time)!,
          minutes(item.endTime) || minutes(item.time)! + 60,
        ),
      )
    )
      items.push({
        id: id(),
        time: clock(rest.start),
        endTime: clock(rest.end),
        title: 'A little time for you',
        description: 'Time to rest, sit with a coffee, or simply enjoy being somewhere new.',
        type: 'rest',
        effort: 'Rest & recharge',
        locked: false,
        alternate: false,
        verification: 'intentional_rest',
        cost: null,
      });
    if (!items.length)
      items.push({
        id: id(),
        time:
          day === 0
            ? trip.input.arrivalTime || '09:00'
            : day === tripDays(trip.input) - 1
              ? trip.input.departureTime || '09:00'
              : '09:00',
        title: 'Keep this travel day open',
        description:
          'Your arrival/departure times and travel buffers leave no schedulable activity window.',
        type: 'rest',
        effort: 'Travel day',
        locked: false,
        alternate: false,
        verification: 'intentional_rest',
        cost: null,
      });
    return items.sort((a, b) => a.time.localeCompare(b.time));
  });
  return { ...trip, days };
}
export function replaceItem(
  trip: Trip,
  day: number,
  itemId: string,
  reduceCost = false,
): Trip | null {
  const item = trip.days[day]?.find((item) => item.id === itemId);
  if (!item || item.locked || !trip.research || item.type === 'rest') return null;
  const pool = rankCandidates(trip.research.candidates, trip, trip.research.evidence);
  const resolveCandidate = (candidateId: string | undefined) => {
    const original = trip.research!.candidates.find((c) => c.id === candidateId);
    return original
      ? {
          ...original,
          ranking:
            pool.find((c) => sameEntity(c, original))?.ranking ||
            rankCandidates([original], trip, trip.research!.evidence)[0]?.ranking,
        }
      : undefined;
  };
  const selected = trip.days.flat().flatMap((scheduled) => {
    const candidate = resolveCandidate(scheduled.candidateId);
    return candidate ? [candidate] : [];
  });
  const current = resolveCandidate(item.candidateId);
  const start = minutes(item.time)!;
  const oldEnd = minutes(item.endTime) || start + 120;
  const previous = trip.days[day]
    .filter((entry) => entry.time < item.time && entry.candidateId)
    .at(-1);
  const next = trip.days[day].find((entry) => entry.time > item.time && entry.candidateId);
  const previousCandidate = resolveCandidate(previous?.candidateId);
  const nextCandidate = resolveCandidate(next?.candidateId);
  const spent =
    trip.days.flat().reduce((sum, scheduled) => sum + (scheduled.cost || 0), 0) - (item.cost || 0);
  const options = pool
    .filter(
      (candidate) =>
        eligible(candidate, trip.style) &&
        destinationMatch(candidate, trip, trip.research!.evidence) === 'supported' &&
        !selected.some((chosen) => sameEntity(chosen, candidate)) &&
        (item.type === 'food'
          ? candidate.category === 'food'
          : candidate.category === 'attraction'),
    )
    .flatMap((candidate) => {
      const cost = normalizedCost(candidate, trip);
      if (cost !== null && spent + cost > budgetTotal(trip.input)) return [];
      if (
        reduceCost &&
        (!current ||
          cost === null ||
          normalizedCost(current, trip) === null ||
          cost >= normalizedCost(current, trip)!)
      )
        return [];
      const end = start + duration(candidate),
        open = minutes(candidate.opensAt),
        close = minutes(candidate.closesAt);
      const before = transferBetween(previousCandidate, candidate),
        after = nextCandidate ? transferBetween(candidate, nextCandidate) : null;
      if (
        end > oldEnd ||
        (open !== null && open > start) ||
        (close !== null && end > close) ||
        closedOn(candidate, dateFor(trip, day), trip.research!.evidence)
      )
        return [];
      if (previous && minutes(previous.endTime)! + before.minutes > start) return [];
      if (next && after && end + after.minutes > minutes(next.time)!) return [];
      if (
        trip.days[day].some(
          (other) =>
            other.id !== item.id &&
            overlaps(
              start,
              end,
              minutes(other.time)!,
              minutes(other.endTime) || minutes(other.time)! + 60,
            ),
        )
      )
        return [];
      const dayWalking =
        trip.days[day]
          .filter((other) => other.id !== item.id)
          .reduce(
            (sum, other) =>
              sum + (pool.find((c) => c.id === other.candidateId)?.walkingMinutes || 0),
            0,
          ) + (candidate.walkingMinutes || 0);
      if (
        (trip.style.walking === 'Minimal walking' && dayWalking > 30) ||
        (trip.style.walking === 'Easy walks' && dayWalking > 90)
      )
        return [];
      const ranking = contextualRanking(
        candidate,
        trip,
        selected.filter((chosen) => chosen.id !== current?.id),
        previousCandidate,
      );
      return [{ candidate, ranking, before, end }];
    })
    .sort(
      (a, b) =>
        b.ranking.score - a.ranking.score ||
        canonicalUrl(a.candidate.url).localeCompare(canonicalUrl(b.candidate.url)),
    );
  const chosen = options[0];
  if (!chosen) return null;
  return {
    ...trip,
    version: trip.version + 1,
    days: trip.days.map((items, index) =>
      index !== day
        ? items
        : items.map((scheduled) =>
            scheduled.id !== item.id
              ? scheduled
              : {
                  ...scheduled,
                  title: chosen.candidate.name,
                  description: chosen.candidate.description,
                  candidateId: chosen.candidate.id,
                  evidenceIds: chosen.candidate.evidenceIds,
                  effort:
                    chosen.candidate.walkingMinutes === null
                      ? 'Walking requirements unverified'
                      : `${chosen.candidate.walkingMinutes} min walking reported`,
                  endTime: clock(chosen.end),
                  cost: normalizedCost(chosen.candidate, trip),
                  verification: 'needs_confirmation',
                  transferMinutes: chosen.before.minutes,
                  transferNote: chosen.before.note,
                  fitReason: chosen.ranking.reasons.slice(0, 2).join(' '),
                  ranking: chosen.ranking,
                },
          ),
    ),
  };
}

export function preserveResearchedPlan(previous: Trip, planned: Trip): Trip {
  if (!previous.research?.candidates.length || !planned.research) return planned;
  const referenced = new Set(previous.days.flat().map((item) => item.candidateId));
  const retainedCandidates = previous.research.candidates.filter((c) => referenced.has(c.id));
  const retainedEvidenceIds = new Set(retainedCandidates.flatMap((c) => c.evidenceIds));
  const merged: Trip = {
    ...planned,
    days: structuredClone(previous.days),
    research: {
      ...planned.research,
      candidates: [
        ...planned.research.candidates,
        ...retainedCandidates.filter(
          (c) => !planned.research!.candidates.some((next) => next.id === c.id),
        ),
      ],
      evidence: [
        ...planned.research.evidence,
        ...previous.research.evidence.filter(
          (e) =>
            retainedEvidenceIds.has(e.id) &&
            !planned.research!.evidence.some((next) => next.id === e.id),
        ),
      ],
    },
  };
  let result = merged;
  previous.days.forEach((items, day) =>
    items.forEach((item) => {
      if (item.verification === 'unresearched' && !item.locked)
        result = replaceItem(result, day, item.id) || result;
    }),
  );
  return result;
}
