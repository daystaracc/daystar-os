import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../csv';

test('parseCsv: well-formed CSV parses exactly as RFC 4180 says', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  // "" is an escaped quote, and quoted fields keep their commas
  assert.deepEqual(parseCsv('"he said ""hi""","a,b"'), [['he said "hi"', 'a,b']]);
  // empty fields, quoted and bare, stay distinct from missing ones
  assert.deepEqual(parseCsv('a,,"",b'), [['a', '', '', 'b']]);
});

test('parseCsv: a quoted field may contain newlines', () => {
  assert.deepEqual(parseCsv('"line1\nline2",x\ny,z'), [['line1\nline2', 'x'], ['y', 'z']]);
});

test('parseCsv: CRLF, a BOM and trailing blank lines are all handled', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n1,2\n\n\n'), [['a', 'b'], ['1', '2']]);
});

/**
 * The reason this module exists. Both names are real, from the 2026-09-07 export;
 * RFC 4180 requires the inner quotes to be doubled and Showmore does not double them.
 */
test('parseCsv: an unescaped quote inside a quoted field is data, not a terminator', () => {
  assert.deepEqual(
    parseCsv(`"''DS" TRUCKER HAT","short socks"`),
    [[`''DS" TRUCKER HAT`, 'short socks']],
  );
  assert.deepEqual(
    parseCsv(`"Daystar "0" Football Jersey ","1280","216"`),
    [['Daystar "0" Football Jersey ', '1280', '216']],
  );
});

test('parseCsv: one bad name does not shift every following column', () => {
  // The real failure: the bad name appears inside another product's 推薦商品 list,
  // mid-row, and a conformant parser then reads every later field one field early.
  const rows = parseCsv(
    'name,recommends,price,stock\n' +
    `"SOCKS","短襪 Socks;''DS" TRUCKER HAT;ICED OUT RAPSTAR BELT","1280","216"\n` +
    '"CAP","","480","12"',
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['SOCKS', `短襪 Socks;''DS" TRUCKER HAT;ICED OUT RAPSTAR BELT`, '1280', '216']);
  assert.deepEqual(rows[2], ['CAP', '', '480', '12']);
  // every row keeps the header's width — the silent corruption was rows of the wrong length
  for (const r of rows) assert.equal(r.length, 4);
});

test('parseCsv: a quote directly before a delimiter still closes the field', () => {
  // Documented limit of the heuristic: genuinely ambiguous, read as a terminator.
  assert.deepEqual(parseCsv('"ends with a quote",next'), [['ends with a quote', 'next']]);
});
