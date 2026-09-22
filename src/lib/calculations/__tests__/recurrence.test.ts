import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence } from '../recurrence';

test('nextOccurrence: daily adds exactly one day', () => {
  assert.equal(nextOccurrence('2026-01-05', 'daily'), '2026-01-06');
  assert.equal(nextOccurrence('2026-01-31', 'daily'), '2026-02-01'); // month rollover
  assert.equal(nextOccurrence('2026-12-31', 'daily'), '2027-01-01'); // year rollover
});

test('nextOccurrence: weekdays skips Saturday and Sunday', () => {
  assert.equal(nextOccurrence('2026-01-02', 'weekdays'), '2026-01-05'); // Fri -> Mon
  assert.equal(nextOccurrence('2026-01-05', 'weekdays'), '2026-01-06'); // Mon -> Tue, no skip needed
  assert.equal(nextOccurrence('2026-01-03', 'weekdays'), '2026-01-05'); // Sat -> Mon (shouldn't normally start on a weekend, but shouldn't land on one either)
});

test('nextOccurrence: weekly adds exactly 7 days, preserving day-of-week', () => {
  assert.equal(nextOccurrence('2026-01-02', 'weekly:FRI'), '2026-01-09');
  assert.equal(nextOccurrence('2026-01-30', 'weekly:FRI'), '2026-02-06'); // month rollover
});

test('nextOccurrence: monthly:<day> lands on that day next month', () => {
  assert.equal(nextOccurrence('2026-01-15', 'monthly:15'), '2026-02-15');
  assert.equal(nextOccurrence('2026-12-15', 'monthly:15'), '2027-01-15'); // year rollover
});

test('nextOccurrence: monthly:<day> clamps to the target month\'s actual last day instead of overflowing into the next month', () => {
  // Regression: before this was fixed (2026-09-21), Date.UTC's automatic day-overflow
  // meant a day that doesn't exist in the target month rolled forward — "monthly:31"
  // from Jan 31 produced 2026-03-03, silently skipping February's occurrence entirely.
  assert.equal(nextOccurrence('2026-01-31', 'monthly:31'), '2026-02-28'); // Feb 2026: 28 days
  assert.equal(nextOccurrence('2026-03-31', 'monthly:31'), '2026-04-30'); // Apr: 30 days
  assert.equal(nextOccurrence('2026-01-30', 'monthly:30'), '2026-02-28');
  assert.equal(nextOccurrence('2028-01-31', 'monthly:31'), '2028-02-29'); // 2028 is a leap year
  assert.equal(nextOccurrence('2026-12-31', 'monthly:31'), '2027-01-31'); // Jan has 31 — no clamping needed
});

test('nextOccurrence: monthly:last always lands on the actual last day of next month', () => {
  assert.equal(nextOccurrence('2026-01-31', 'monthly:last'), '2026-02-28');
  assert.equal(nextOccurrence('2028-01-31', 'monthly:last'), '2028-02-29'); // leap year
  assert.equal(nextOccurrence('2026-12-31', 'monthly:last'), '2027-01-31'); // year rollover
});

test('nextOccurrence: an unrecognized rule returns null rather than guessing', () => {
  assert.equal(nextOccurrence('2026-01-05', 'yearly'), null);
  assert.equal(nextOccurrence('2026-01-05', ''), null);
});
