import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from './en';
import { zhHant } from './zh-Hant';
import { makeT, interpolate, localizedField } from './index';

function keys(o: object, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : keys(v as object, p + k + '.')));
}
test('zh-Hant has exactly the same keys as en', () => { assert.deepEqual(keys(zhHant).sort(), keys(en).sort()); });
test('interpolation and plural', () => {
  const t = makeT(zhHant);
  assert.equal(t('cc.greeting.afternoon', { name: 'KAi' }), '午安，KAi。');
  assert.equal(makeT(en)('attention.revenue_behind', { pct: 22, actual: 25880, required: 34480 }), 'Revenue is 22% behind expected pace (NT$25,880/day vs NT$34,480/day needed).');
  assert.equal(interpolate(en.attention.review_due, { days: 0 }), 'Weekly Business Review is due today.');
  assert.equal(interpolate(en.attention.review_due, { days: 1 }), 'Weekly Business Review is due tomorrow.');
  // "#" is the ICU placeholder for the number the plural is about.
  assert.equal(interpolate(en.tasks.count, { count: 1 }), '1 task');
  assert.equal(interpolate(en.tasks.count, { count: 15 }), '15 tasks');
  assert.equal(interpolate(zhHant.tasks.count, { count: 15 }), '15 個任務');
});

test('localizedField: zh column when filled, base column otherwise', () => {
  const project = { name: 'September Campaign', name_zh: '九月檔期' };
  assert.equal(localizedField(project, 'name', 'zh-Hant'), '九月檔期');
  assert.equal(localizedField(project, 'name', 'en'), 'September Campaign');

  // DAYSTAR's product names are the brand's own names and carry no Chinese variant:
  // both locales must show the English name, never an empty label.
  for (const product of [
    { name: '4MM Tennis Chain', name_zh: null },
    { name: '4MM Tennis Chain', name_zh: '' },
    { name: '4MM Tennis Chain', name_zh: '   ' },
    { name: '4MM Tennis Chain' }, // column not selected at all
  ]) {
    assert.equal(localizedField(product, 'name', 'zh-Hant'), '4MM Tennis Chain');
    assert.equal(localizedField(product, 'name', 'en'), '4MM Tennis Chain');
  }

  // `tasks` has no title_zh column in the schema — the helper just falls through.
  assert.equal(localizedField({ title: 'Publish 20:00 video' }, 'title', 'zh-Hant'), 'Publish 20:00 video');

  // A missing row never throws and never renders "undefined".
  assert.equal(localizedField(null, 'name', 'zh-Hant'), '');
  assert.equal(localizedField(undefined, 'title', 'en'), '');

  // The English column is never replaced by the Chinese one, even when only zh is set.
  assert.equal(localizedField({ name: '', name_zh: '客單' }, 'name', 'en'), '');
  assert.equal(localizedField({ name: '', name_zh: '客單' }, 'name', 'zh-Hant'), '客單');
});
