import { z } from 'zod';

const short = z.string().trim().max(200);
export const styleSchema = z.object({
  pace: z.enum(['', 'Peaceful', 'Balanced', 'Packed']),
  atmosphere: z.enum(['', 'Quiet spaces', 'A mix', 'Meet people']),
  walking: z.enum(['', 'Minimal walking', 'Easy walks', 'Long walks', 'Hikes']),
  interests: z
    .array(
      z.enum([
        'Nature',
        'Culture',
        'Food',
        'Beaches',
        'Photography',
        'Wellness',
        'Temples',
        'Nightlife',
        'Shopping',
      ]),
    )
    .max(9),
  food: z.enum(['', 'No preference', 'Vegetarian', 'Vegan', 'Jain', 'Nonvegetarian', 'Flexible']),
  stay: z.enum(['', 'Hostel', 'Simple private room', 'Boutique', 'Luxury']),
  restrictions: z.string().max(2000),
  notes: z.string().max(2000),
});
export const inputSchema = z.object({
  destination: short.min(2),
  origin: short,
  dateMode: z.enum(['exact', 'flexible']),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  duration: z.number().int().min(1).max(30),
  party: z.enum(['Solo', 'Couple', 'Friends', 'Family']),
  travelers: z.number().int().min(1).max(20),
  budget: z
    .string()
    .max(20)
    .refine(
      (x) => Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) <= 1e10,
      'Enter a valid budget',
    ),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'IDR', 'JPY']),
  basis: z.enum(['per person', 'whole group']),
  transportIncluded: z.boolean(),
  rooms: z.number().int().min(1).max(20).default(1),
  arrivalTime: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional(),
  departureTime: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional(),
});
export const createTripSchema = z.object({
  input: inputSchema,
  style: styleSchema,
  requestId: z.string().uuid(),
});
export const watchSchema = z.object({
  type: z.enum(['fetch', 'search']),
  target: z.string().trim().min(3).max(2000),
  frequency: z.enum(['daily', 'six_hourly']),
  expiresAt: z.string().datetime(),
  confirmed: z.literal(true),
});
export const editSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('optimize'), version: z.number().int() }),
  z.object({
    action: z.literal('lock'),
    version: z.number().int(),
    day: z.number().int().min(0).max(29),
    itemId: short,
    locked: z.boolean(),
  }),
  z.object({
    action: z.literal('swap'),
    version: z.number().int(),
    day: z.number().int().min(0).max(29),
    itemId: short,
  }),
  z.object({
    action: z.literal('quiet'),
    version: z.number().int(),
    day: z.number().int().min(0).max(29),
  }),
  z.object({ action: z.literal('save'), version: z.number().int() }),
  z.object({
    action: z.literal('reduce_cost'),
    version: z.number().int(),
    day: z.number().int().min(0).max(29),
  }),
]);
export const extractedCandidate = z.object({
  name: z.string().min(2).max(250),
  category: z.enum(['attraction', 'food', 'stay', 'transport', 'event']),
  description: z.string().max(2000),
  url: z.string().url(),
  location: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  durationMinutes: z.number().min(10).max(720).nullable(),
  walkingMinutes: z.number().min(0).max(720).nullable(),
  stepFree: z.boolean().nullable(),
  diets: z.array(z.string()).max(10),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  date: z.string().nullable(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().max(3),
  priceUnit: z.enum(['person', 'room_night', 'group', 'unknown']),
  taxesIncluded: z.boolean().nullable(),
  gaps: z.array(z.string()).max(20),
});
export const extractionSchema = z.object({
  candidates: z.array(extractedCandidate).max(12),
  gaps: z.array(z.string()).max(30),
});

// TinyFish supports nullable:true, not Zod's union-of-null JSON schema.
const nullable = (type: string) => ({ type, nullable: true });
export const agentOutputSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: ['attraction', 'food', 'stay', 'transport', 'event'] },
          description: { type: 'string' },
          url: { type: 'string' },
          location: nullable('string'),
          latitude: { type: 'number', minimum: -90, maximum: 90, nullable: true },
          longitude: { type: 'number', minimum: -180, maximum: 180, nullable: true },
          durationMinutes: nullable('number'),
          walkingMinutes: nullable('number'),
          stepFree: nullable('boolean'),
          diets: { type: 'array', items: { type: 'string' } },
          opensAt: nullable('string'),
          closesAt: nullable('string'),
          date: nullable('string'),
          amount: nullable('number'),
          currency: { type: 'string' },
          priceUnit: { type: 'string', enum: ['person', 'room_night', 'group', 'unknown'] },
          taxesIncluded: nullable('boolean'),
          gaps: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'name',
          'category',
          'description',
          'url',
          'location',
          'durationMinutes',
          'walkingMinutes',
          'stepFree',
          'diets',
          'opensAt',
          'closesAt',
          'date',
          'amount',
          'currency',
          'priceUnit',
          'taxesIncluded',
          'gaps',
        ],
      },
    },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['candidates', 'gaps'],
};
