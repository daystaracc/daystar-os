/**
 * Showmore product-master parser (商品管理 → 匯出).
 *
 * Pure: it takes the already-read sheet rows and returns the catalogue the import
 * wizard previews and then writes. No database, no I/O.
 *
 * What the real 2026-09-07 export forced:
 *
 *  - **The file is not valid CSV.** Read it with `parseCsv` from `./csv`, never a
 *    conformant parser — see that module for the measurement (53 of 320 rows).
 *
 *  - **A product spans consecutive rows and only the first one is labelled.** The
 *    first row of a product carries `product_id`, `商品名稱` and the *names* of the
 *    variant levels (`第一層樣式名稱`); every following row of the same product has
 *    both columns blank and carries only that variant's own values. In the real
 *    file 102 rows are labelled and 218 are continuations — 320 variants in all.
 *    Reading rows independently produces 218 nameless products.
 *
 *  - **`成本 = 0` means unknown, not free.** Only 115 of 320 variants have a real
 *    cost. A zero would read as 100% gross margin, so it becomes `null` — the same
 *    rule migration 0005 encodes for `products.cost`.
 *
 *  - **`商品編號(sku)` is empty on 314 of 320 rows**, so it cannot be a join key.
 *    Showmore's `product_id` / `variant_id` are stable and are what we store.
 *
 *  - **Variant level names are inconsistent** (顏色 / Color / COLOR / Colore for one
 *    concept) and four are not attribute names at all. Recognised ones fold to a
 *    canonical key; anything else is kept as a free-text label rather than guessed.
 */

/** Canonical variant attributes. Anything not on this list stays free text. */
export type VariantAttributeKey = 'color' | 'size' | 'width' | 'length' | 'quantity' | 'style' | 'letter';

/**
 * Raw 樣式名稱 → canonical key, matched case-insensitively after trimming.
 * Deliberately absent, because they are product names or compound labels rather
 * than attribute names: `Mystery Box 2.0`, `TURCKER HAT`, `款式尺寸`, `項鍊`.
 */
const ATTRIBUTE_KEYS: Record<string, VariantAttributeKey> = {
  '顏色': 'color', 'color': 'color', 'colore': 'color',
  '尺寸': 'size', 'size': 'size',
  '寬度': 'width', 'width': 'width', 'width 寬度': 'width',
  '長度': 'length', 'length': 'length', 'length 長度': 'length', '長短': 'length',
  '數量': 'quantity', 'quantity': 'quantity',
  '款式': 'style', 'style': 'style',
  '字母': 'letter', 'letter': 'letter',
};

export const PRODUCT_COL = {
  productId: 'product_id(注意 此行請勿更動)',
  variantId: 'variant_id(注意 此行請勿更動)',
  name: '商品名稱',
  sku: '商品編號(sku)',
  listPrice: '原價',
  price: '售價',
  cost: '成本',
  stock: '官網庫存',
  weight: '重量(kg)',
  level1Name: '第一層樣式名稱', level1: '第一層樣式',
  level2Name: '第二層樣式名稱', level2: '第二層樣式',
  level3Name: '第三層樣式名稱', level3: '第三層樣式',
} as const;

export interface VariantAttribute {
  level: 1 | 2 | 3;
  /** The 樣式名稱 exactly as Showmore wrote it. */
  rawName: string;
  /** Canonical key, or null when the name is not a recognised attribute. */
  key: VariantAttributeKey | null;
  value: string;
}

export interface ParsedVariant {
  showmoreVariantId: string;
  attributes: VariantAttribute[];
  /** Variant values joined for display, e.g. `1.2MM / 50CM`. Empty for unvarianted products. */
  label: string;
  sku: string | null;
  listPrice: number | null;
  price: number | null;
  /** null when 成本 is blank or 0 — unknown, never treated as free. */
  cost: number | null;
  onHand: number;
  weightKg: number | null;
}

export interface ParsedProduct {
  showmoreProductId: string;
  name: string;
  variants: ParsedVariant[];
}

export interface AttributeNameUsage {
  rawName: string;
  key: VariantAttributeKey | null;
  variants: number;
}

export interface ShowmoreProductsParseResult {
  rows: { total: number; skippedNoVariantId: number; orphanRows: number };
  products: ParsedProduct[];
  totals: {
    products: number;
    variants: number;
    onHand: number;
    /** Variants with a real cost, and variants whose cost is unknown. */
    costed: number;
    uncosted: number;
  };
  /** Every 樣式名稱 seen, folded or not, so the wizard can show what was interpreted. */
  attributeNames: AttributeNameUsage[];
  /** Product names used by more than one product_id — they cannot be matched by name alone. */
  duplicateNames: { name: string; showmoreProductIds: string[] }[];
  warnings: string[];
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Blank → null, so "no price" and "free" stay different. */
const numOrNull = (v: unknown): number | null => {
  const s = text(v);
  if (s === '') return null;
  const n = Number(s.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const int = (v: unknown): number => {
  const n = numOrNull(v);
  return n === null ? 0 : Math.trunc(n);
};

/** Fold a 樣式名稱 onto a canonical key, or null when it is not an attribute name. */
export function attributeKeyFor(rawName: string): VariantAttributeKey | null {
  return ATTRIBUTE_KEYS[rawName.trim().toLowerCase()] ?? null;
}

/**
 * @param rows sheet rows including the header row, as read by `parseCsv`.
 */
export function parseShowmoreProducts(rows: unknown[][]): ShowmoreProductsParseResult {
  const warnings: string[] = [];
  if (!rows.length) return empty(['The sheet is empty.']);

  const header = rows[0].map(h => text(h));
  const at = (name: string) => header.indexOf(name);
  const iVariantId = at(PRODUCT_COL.variantId);
  const iProductId = at(PRODUCT_COL.productId);
  if (iVariantId < 0 || iProductId < 0) {
    return empty([`Columns "${PRODUCT_COL.productId}" and "${PRODUCT_COL.variantId}" not found — is this a Showmore product export?`]);
  }

  const idx = Object.fromEntries(
    Object.entries(PRODUCT_COL).map(([k, v]) => [k, at(v)]),
  ) as Record<keyof typeof PRODUCT_COL, number>;
  for (const [key, i] of Object.entries(idx)) {
    if (i < 0) warnings.push(`Column "${PRODUCT_COL[key as keyof typeof PRODUCT_COL]}" is missing; treated as empty.`);
  }
  const cell = (row: unknown[], i: number) => (i >= 0 ? row[i] : null);

  const body = rows.slice(1);
  const products: ParsedProduct[] = [];
  const attributeUse = new Map<string, AttributeNameUsage>();
  let skippedNoVariantId = 0;
  let orphanRows = 0;

  // Carried down from a product's first row onto its continuation rows.
  let current: ParsedProduct | null = null;
  let levelNames: [string, string, string] = ['', '', ''];

  for (const row of body) {
    const productId = text(cell(row, idx.productId));
    const name = text(cell(row, idx.name));

    if (productId) {
      current = { showmoreProductId: productId, name, variants: [] };
      levelNames = [
        text(cell(row, idx.level1Name)),
        text(cell(row, idx.level2Name)),
        text(cell(row, idx.level3Name)),
      ];
      products.push(current);
    }

    const variantId = text(cell(row, idx.variantId));
    if (!variantId) { skippedNoVariantId += 1; continue; }
    if (!current) { orphanRows += 1; continue; } // a variant row before any product row

    const values: [string, string, string] = [
      text(cell(row, idx.level1)),
      text(cell(row, idx.level2)),
      text(cell(row, idx.level3)),
    ];

    const attributes: VariantAttribute[] = [];
    for (let level = 0; level < 3; level += 1) {
      const value = values[level];
      if (!value) continue;
      const rawName = levelNames[level];
      const key = rawName ? attributeKeyFor(rawName) : null;
      attributes.push({ level: (level + 1) as 1 | 2 | 3, rawName, key, value });

      if (rawName) {
        const use = attributeUse.get(rawName) ?? { rawName, key, variants: 0 };
        use.variants += 1;
        attributeUse.set(rawName, use);
      }
    }

    const cost = numOrNull(cell(row, idx.cost));
    current.variants.push({
      showmoreVariantId: variantId,
      attributes,
      label: attributes.map(a => a.value).join(' / '),
      sku: text(cell(row, idx.sku)) || null,
      listPrice: numOrNull(cell(row, idx.listPrice)),
      price: numOrNull(cell(row, idx.price)),
      // 0 is Showmore's "not filled in", not a real cost of zero.
      cost: cost !== null && cost > 0 ? cost : null,
      onHand: int(cell(row, idx.stock)),
      weightKg: numOrNull(cell(row, idx.weight)),
    });
  }

  const allVariants = products.flatMap(p => p.variants);
  const unnamed = products.filter(p => !p.name).length;
  if (unnamed) warnings.push(`${unnamed} product(s) have no 商品名稱 and cannot be matched by name.`);
  if (orphanRows) warnings.push(`${orphanRows} variant row(s) appear before any product row and were skipped.`);

  const byName = new Map<string, string[]>();
  for (const p of products) {
    if (!p.name) continue;
    byName.set(p.name, [...(byName.get(p.name) ?? []), p.showmoreProductId]);
  }
  const duplicateNames = [...byName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, showmoreProductIds]) => ({ name, showmoreProductIds }));
  if (duplicateNames.length) {
    warnings.push(`${duplicateNames.length} product name(s) are used by more than one product; order lines cannot be matched on name alone.`);
  }

  const unrecognised = [...attributeUse.values()].filter(a => a.key === null);
  if (unrecognised.length) {
    warnings.push(`${unrecognised.length} variant level name(s) are not recognised attributes and are kept as free text: ${unrecognised.map(a => a.rawName).join(', ')}.`);
  }

  return {
    rows: { total: body.length, skippedNoVariantId, orphanRows },
    products,
    totals: {
      products: products.length,
      variants: allVariants.length,
      onHand: allVariants.reduce((a, v) => a + v.onHand, 0),
      costed: allVariants.filter(v => v.cost !== null).length,
      uncosted: allVariants.filter(v => v.cost === null).length,
    },
    attributeNames: [...attributeUse.values()].sort((a, b) => b.variants - a.variants || a.rawName.localeCompare(b.rawName)),
    duplicateNames,
    warnings,
  };
}

function empty(warnings: string[]): ShowmoreProductsParseResult {
  return {
    rows: { total: 0, skippedNoVariantId: 0, orphanRows: 0 },
    products: [],
    totals: { products: 0, variants: 0, onHand: 0, costed: 0, uncosted: 0 },
    attributeNames: [], duplicateNames: [], warnings,
  };
}
