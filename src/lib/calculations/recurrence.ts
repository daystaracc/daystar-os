/**
 * Task recurrence: given the due date of the occurrence being completed, work out
 * the due date of the next one. Rules are stored on `tasks.recurring_rule` as
 * `daily` | `weekdays` | `weekly:<DAY>` | `monthly:<1-31>` | `monthly:last`.
 * Pure date math — no database, no UI — so it lives with the rest of the calculations.
 */
const DAY = 86_400_000;

export function nextOccurrence(due: string, rule: string): string | null {
  const [y, m, d] = due.split('-').map(Number);
  const at = (dt: Date) => dt.toISOString().slice(0, 10);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (rule === 'daily') return at(new Date(base.getTime() + DAY));
  if (rule === 'weekdays') {
    let n = new Date(base.getTime() + DAY);
    while ([0, 6].includes(n.getUTCDay())) n = new Date(n.getTime() + DAY);
    return at(n);
  }
  if (rule.startsWith('weekly:')) return at(new Date(base.getTime() + 7 * DAY));
  if (rule === 'monthly:last') return at(new Date(Date.UTC(y, m + 1, 0)));
  if (rule.startsWith('monthly:')) {
    const day = Number(rule.split(':')[1]) || 1;
    // Date.UTC silently rolls a day that doesn't exist in the target month into the
    // FOLLOWING month (e.g. day 31 in a 30-day month) — found 2026-09-21 while adding
    // test coverage: "monthly:31" from 2026-01-31 landed on 2026-03-03, skipping
    // February's occurrence entirely instead of landing in it. Clamp to the target
    // month's real last day instead, same "day 0 of next month" trick monthly:last
    // already uses above, so e.g. "the 31st" behaves like "the last day" in short months.
    const daysInTargetMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return at(new Date(Date.UTC(y, m, Math.min(day, daysInTargetMonth))));
  }
  return null;
}
