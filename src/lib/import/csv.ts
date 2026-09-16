/**
 * Tolerant CSV reader.
 *
 * Showmore's product export (`商品管理 → 匯出`) is not valid CSV. Product names
 * contain raw double quotes that RFC 4180 requires to be doubled:
 *
 *     "Daystar "0" Football Jersey "
 *     "''DS" TRUCKER HAT"
 *
 * and those names are reproduced inside other products' 推薦商品 lists, so one bad
 * name corrupts many rows. Measured on the real 2026-09-07 export (320 variants):
 * a conformant parser recovers **53 rows**, SheetJS 296, Excel mangles it a third
 * way. All three fail silently — they return rows, just not the right ones, which
 * is the dangerous kind of wrong for an importer.
 *
 * The rule that recovers all 320: inside a quoted field, a `"` closes the field
 * only when the next character is a delimiter, a newline, or end of input.
 * Anything else means it is a literal quote in the data. `""` is still an escaped
 * quote, so well-formed files parse exactly as they should.
 *
 * The one case this cannot resolve is a literal quote immediately before a comma
 * or newline (`...HAT",`), which is genuinely ambiguous — it is read as the end of
 * the field. No row in the real export hits it, and no heuristic can do better
 * without knowing the expected column count.
 */

export interface CsvOptions {
  /** Field separator. Default `,`. */
  delimiter?: string;
}

/**
 * Parse CSV text into rows of raw string fields. Values are returned exactly as
 * written — no trimming, no type coercion — because the column parsers decide what
 * a blank or a `0` means for their own columns.
 */
export function parseCsv(input: string, options: CsvOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ',';
  const text = stripBom(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false; // this field opened with a quote
  let inQuotes = false;
  let i = 0;

  const endField = () => { row.push(field); field = ''; quoted = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        const next = text[i + 1];
        // A closing quote is only a closing quote if a delimiter follows it.
        if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
          inQuotes = false; i += 1; continue;
        }
        field += '"'; i += 1; continue; // literal quote inside the data
      }
      field += c; i += 1; continue; // newlines inside quotes belong to the field
    }

    if (c === '"' && field === '' && !quoted) { inQuotes = true; quoted = true; i += 1; continue; }
    if (c === delimiter) { endField(); i += 1; continue; }
    if (c === '\n') { endRow(); i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    field += c; i += 1;
  }

  // A final row without a trailing newline still counts.
  if (field !== '' || quoted || row.length) endRow();

  // Trailing blank lines are an artefact of the export, not data.
  while (rows.length && rows[rows.length - 1].every(f => f === '')) rows.pop();
  return rows;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
