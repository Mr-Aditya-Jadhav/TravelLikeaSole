import type { ResearchState, RecommendationRanking } from './research.ts';

export type TravelStyle = {
  pace: string;
  atmosphere: string;
  walking: string;
  interests: string[];
  food: string;
  stay: string;
  restrictions: string;
  notes: string;
};

export type TripInput = {
  destination: string;
  origin: string;
  dateMode: 'flexible' | 'exact';
  startDate: string;
  endDate: string;
  duration: number;
  party: string;
  travelers: number;
  budget: string;
  currency: string;
  basis: 'per person' | 'whole group';
  transportIncluded: boolean;
  rooms?: number;
  arrivalTime?: string;
  departureTime?: string;
};

export type PlanItem = {
  id: string;
  time: string;
  title: string;
  description: string;
  type: 'discover' | 'food' | 'rest';
  effort: string;
  locked: boolean;
  alternate: boolean;
  original?: { title: string; description: string };
  candidateId?: string;
  evidenceIds?: string[];
  verification?: 'sourced' | 'needs_confirmation' | 'intentional_rest' | 'unresearched';
  endTime?: string;
  transferMinutes?: number;
  fitReason?: string;
  cost?: number | null;
  ranking?: RecommendationRanking;
  transferNote?: string;
};

export type Trip = {
  id: string;
  input: TripInput;
  style: TravelStyle;
  days: PlanItem[][];
  createdAt: string;
  version: number;
  research?: ResearchState;
  serverOwned?: boolean;
  summary?: string;
  saved?: boolean;
};

export const defaultStyle: TravelStyle = {
  pace: '',
  atmosphere: '',
  walking: '',
  interests: [],
  food: '',
  stay: '',
  restrictions: '',
  notes: '',
};

export const defaultInput: TripInput = {
  destination: '',
  origin: '',
  dateMode: 'flexible',
  startDate: '',
  endDate: '',
  duration: 5,
  party: 'Solo',
  travelers: 1,
  budget: '',
  currency: 'INR',
  basis: 'per person',
  transportIncluded: false,
  rooms: 1,
  arrivalTime: '',
  departureTime: '',
};

export function tripDays(input: TripInput): number {
  if (input.dateMode === 'flexible') return Math.max(1, Math.min(30, Math.floor(input.duration)));
  const start = Date.parse(input.startDate + 'T00:00:00Z');
  const end = Date.parse(input.endDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function validateInput(input: TripInput): string | null {
  if (!input.destination.trim()) return 'Choose a destination to start your escape.';
  if (!Number.isFinite(Number(input.budget)) || Number(input.budget) <= 0)
    return 'Enter a budget greater than zero. You can adjust it later.';
  if (!Number.isInteger(input.travelers) || input.travelers < 1 || input.travelers > 20)
    return 'Choose between 1 and 20 travelers.';
  if (
    input.dateMode === 'exact' &&
    [input.startDate, input.endDate].some(
      (date) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
        new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date,
    )
  )
    return 'Choose valid calendar dates.';
  if (!tripDays(input) || tripDays(input) > 30)
    return 'Choose a valid date range of up to 30 days.';
  if (input.dateMode === 'exact' && input.startDate < localDate())
    return 'Choose today or a future departure date.';
  return null;
}

export function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function budgetTotal(input: TripInput): number {
  return Number(input.budget) * (input.basis === 'per person' ? input.travelers : 1);
}

export function money(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function styleSummary(style: TravelStyle): string {
  const pace = style.pace ? `${style.pace.toLowerCase()} days` : 'days at your own pace';
  const interests = style.interests.length
    ? style.interests
        .slice(0, 3)
        .map((x) => x.toLowerCase())
        .join(', ')
    : 'a little discovery';
  return `A trip with ${pace}, ${interests}${style.food && style.food !== 'No preference' ? `, and ${style.food.toLowerCase()} food` : ''}.`;
}

export function buildDraft(input: TripInput, style: TravelStyle): Trip {
  const days = Array.from({ length: tripDays(input) }, (_, day) => {
    const interest = style.interests[day % Math.max(1, style.interests.length)] || 'Local culture';
    const lowWalking = ['Minimal walking', 'Easy walks'].includes(style.walking);
    const base: PlanItem[] = [
      {
        id: `${day}-am`,
        time: '09:30',
        title: `${interest} at your own pace`,
        description: `Explore ${input.destination.split(',')[0]} through ${interest.toLowerCase()}. Specific places, opening hours, access, and transfers need research.`,
        type: 'discover',
        effort: lowWalking
          ? 'Short visits requested · access unverified'
          : 'Effort to be confirmed',
        locked: false,
        alternate: false,
      },
      {
        id: `${day}-lunch`,
        time: '12:30',
        title:
          style.food && style.food !== 'No preference'
            ? `A ${style.food.toLowerCase()} lunch`
            : 'A taste of somewhere new',
        description: style.restrictions
          ? `Find a local table. Confirm these requirements directly: ${style.restrictions}.`
          : 'Leave room for a local favorite. Menus, dietary suitability, and prices need confirmation.',
        type: 'food',
        effort: 'Unhurried meal',
        locked: false,
        alternate: false,
      },
      {
        id: `${day}-rest`,
        time: '14:00',
        title: 'A little time for you',
        description:
          'A slow coffee, a journal entry, or absolutely nothing. This time belongs to you.',
        type: 'rest',
        effort: 'Rest & recharge',
        locked: false,
        alternate: false,
      },
    ];
    if (style.pace !== 'Peaceful')
      base.push({
        id: `${day}-pm`,
        time: '16:00',
        title:
          style.atmosphere === 'Meet people'
            ? 'Find a shared local experience'
            : 'Follow your curiosity',
        description:
          'An optional afternoon discovery, with time to get back before dinner. Availability and routes need confirmation.',
        type: 'discover',
        effort: 'Effort to be confirmed',
        locked: false,
        alternate: false,
      });
    return base;
  });
  return {
    id: crypto.randomUUID(),
    input: { ...input },
    style: { ...style, interests: [...style.interests] },
    days,
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

export function swapItem(trip: Trip, day: number, id: string): Trip {
  return {
    ...trip,
    version: trip.version + 1,
    days: trip.days.map((items, index) =>
      index !== day
        ? items
        : items.map((item) => {
            if (item.id !== id || item.locked) return item;
            if (item.alternate && item.original)
              return { ...item, ...item.original, alternate: false };
            const foodTitle = trip.style.food
              ? `A different ${trip.style.food.toLowerCase()} local table`
              : 'Find a different local table';
            return {
              ...item,
              original: { title: item.title, description: item.description },
              alternate: true,
              title: item.type === 'food' ? foodTitle : 'A slower local discovery',
              description:
                item.type === 'food'
                  ? `Try an alternative lunch spot. Menus, prices, and dietary suitability need confirmation.${trip.style.restrictions ? ` Keep these requirements: ${trip.style.restrictions}.` : ''}`
                  : `An alternative idea with room to wander. Confirm a specific place, timing, access, and cost.${trip.style.restrictions ? ` Keep these requirements: ${trip.style.restrictions}.` : ''}`,
            };
          }),
    ),
  };
}
