import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetTotal,
  buildDraft,
  defaultInput,
  defaultStyle,
  localDate,
  swapItem,
  tripDays,
  validateInput,
} from './planner.ts';

test('same-day trips have one day and no accommodation nights', () => {
  const input = {
    ...defaultInput,
    dateMode: 'exact' as const,
    startDate: '2030-12-01',
    endDate: '2030-12-01',
  };
  assert.equal(tripDays(input), 1);
  assert.equal(tripDays(input) - 1, 0);
});

test('date counting is consistent across daylight-saving changes', () => {
  assert.equal(
    tripDays({
      ...defaultInput,
      dateMode: 'exact',
      startDate: '2030-03-09',
      endDate: '2030-03-12',
    }),
    4,
  );
});

test('missing budget, reversed dates, and past departure block review', () => {
  const input = { ...defaultInput, destination: 'Kyoto, Japan' };
  assert.match(validateInput(input)!, /budget/);
  assert.match(
    validateInput({
      ...input,
      budget: '50000',
      dateMode: 'exact',
      startDate: '2030-12-04',
      endDate: '2030-12-01',
    })!,
    /date range/,
  );
  assert.match(
    validateInput({
      ...input,
      budget: '50000',
      dateMode: 'exact',
      startDate: '2020-01-01',
      endDate: '2020-01-03',
    })!,
    /future/,
  );
  assert.equal(
    validateInput({
      ...input,
      budget: '50000',
      dateMode: 'exact',
      startDate: localDate(),
      endDate: localDate(),
    }),
    null,
  );
});

test('invalid calendar dates are rejected instead of rolling into the next month', () => {
  assert.match(
    validateInput({
      ...defaultInput,
      destination: 'Kyoto',
      budget: '50000',
      dateMode: 'exact',
      startDate: '2030-02-30',
      endDate: '2030-03-03',
    })!,
    /calendar dates/,
  );
});

test('per-person budgets scale with party size; group budgets do not', () => {
  assert.equal(
    budgetTotal({ ...defaultInput, budget: '30000', travelers: 3, basis: 'per person' }),
    90000,
  );
  assert.equal(
    budgetTotal({ ...defaultInput, budget: '30000', travelers: 3, basis: 'whole group' }),
    30000,
  );
});

test('peaceful drafts leave afternoons open; selected diet remains visible', () => {
  const trip = buildDraft(
    { ...defaultInput, destination: 'Bali', duration: 2 },
    { ...defaultStyle, pace: 'Peaceful', food: 'Vegetarian' },
  );
  assert.equal(trip.days.length, 2);
  assert.ok(trip.days.every((day) => day.length === 3));
  assert.ok(trip.days[0].some((item) => item.title.includes('vegetarian')));
});

test('activity swaps preserve locks and every other day', () => {
  const original = buildDraft({ ...defaultInput, destination: 'Kyoto', duration: 2 }, defaultStyle);
  original.days[0][0].locked = true;
  const lockedSwap = swapItem(original, 0, original.days[0][0].id);
  assert.deepEqual(lockedSwap.days[0][0], original.days[0][0]);
  const swapped = swapItem(original, 0, original.days[0][1].id);
  assert.notEqual(swapped.days[0][1].title, original.days[0][1].title);
  assert.deepEqual(swapped.days[1], original.days[1]);
  assert.equal(original.version + 1, swapped.version);
});

test('meal swaps keep dietary requirements and can restore the original idea', () => {
  const trip = buildDraft(
    { ...defaultInput, destination: 'Kyoto', duration: 1 },
    { ...defaultStyle, food: 'Vegetarian', restrictions: 'No peanuts' },
  );
  const meal = trip.days[0][1];
  const swapped = swapItem(trip, 0, meal.id);
  assert.match(swapped.days[0][1].title, /vegetarian/);
  assert.match(swapped.days[0][1].description, /No peanuts/);
  const restored = swapItem(swapped, 0, meal.id);
  assert.equal(restored.days[0][1].title, meal.title);
  assert.equal(restored.days[0][1].description, meal.description);
});
