/**
 * Generates `src/types/database.ts` from the live Supabase project.
 *
 * Preferred path: the official CLI (`supabase gen types typescript --project-id`).
 * It needs a Supabase *personal access token* (`supabase login`, or
 * SUPABASE_ACCESS_TOKEN), which is not one of the project keys in .env.local.
 *
 * Fallback: derive the same `Database` type from the project's live PostgREST
 * OpenAPI document, which the service-role key in .env.local can read. Same
 * source of truth (the running database), no extra credential.
 *
 * Reads .env.local itself, so `npm run db:types` needs no shell setup and
 * behaves identically on Windows, macOS and Linux.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/types/database.ts');
const CLI = join(root, 'node_modules/supabase/dist/supabase.js');

for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { SUPABASE_PROJECT_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN } = process.env;

function write(source, body) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  console.log(`wrote src/types/database.ts from ${source} (${body.length} bytes)`);
}

// ---- 1. official CLI -------------------------------------------------------
if (SUPABASE_ACCESS_TOKEN && SUPABASE_PROJECT_ID) {
  const cli = spawnSync(
    process.execPath,
    [CLI, 'gen', 'types', 'typescript', '--project-id', SUPABASE_PROJECT_ID, '--schema', 'public'],
    { encoding: 'utf8', cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );
  if (cli.status === 0 && cli.stdout?.includes('export type Database')) {
    write('the supabase CLI', cli.stdout);
    process.exit(0);
  }
  console.warn('supabase CLI failed; falling back to the OpenAPI schema:\n' + (cli.stderr || cli.stdout || ''));
}

// ---- 2. OpenAPI fallback ---------------------------------------------------
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  process.exit(1);
}
const res = await fetch(`${NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`, {
  headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
});
if (!res.ok) {
  console.error(`OpenAPI request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const spec = await res.json();

const SCALAR = [
  [/^(uuid|text|character varying|character|citext|name|date|time|timestamp|interval|inet|cidr|macaddr|bytea|money|xml|tsvector)/, 'string'],
  [/^(smallint|integer|bigint|numeric|decimal|real|double precision|smallserial|serial|bigserial|float)/, 'number'],
  [/^boolean/, 'boolean'],
  [/^(json|jsonb)/, 'Json'],
];

function tsType(prop) {
  if (Array.isArray(prop.enum) && prop.enum.length) return prop.enum.map((v) => JSON.stringify(v)).join(' | ');
  const fmt = String(prop.format ?? '');
  const isArray = fmt.endsWith('[]');
  const base = isArray ? fmt.slice(0, -2) : fmt;
  const hit = SCALAR.find(([re]) => re.test(base));
  const t = hit
    ? hit[1]
    : prop.type === 'number' || prop.type === 'integer'
      ? 'number'
      : prop.type === 'boolean'
        ? 'boolean'
        : 'string';
  return isArray ? `${t}[]` : t;
}

const FK = /<fk table='([^']+)' column='([^']+)'\/>/;

function relationships(name, def) {
  const out = [];
  for (const [col, prop] of Object.entries(def.properties ?? {})) {
    const m = FK.exec(prop.description ?? '');
    if (!m) continue;
    // Inline `references` in the migrations means Postgres auto-names the constraint <table>_<column>_fkey.
    out.push({ foreignKeyName: `${name}_${col}_fkey`, columns: [col], isOneToOne: false, referencedRelation: m[1], referencedColumns: [m[2]] });
  }
  return out;
}

const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const indent = (n, s) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');
const nest = (n, s) => indent(n, s).trimStart();

function block(def, kind) {
  const required = new Set(def.required ?? []);
  const lines = Object.entries(def.properties ?? {}).map(([col, prop]) => {
    const t = tsType(prop);
    const nullable = !required.has(col);
    if (kind === 'Row') return `${key(col)}: ${t}${nullable ? ' | null' : ''}`;
    // PostgREST never reports a `default` for array columns, so a NOT NULL array
    // with `default '{}'` would otherwise look mandatory on insert.
    const hasDefault = 'default' in prop || String(prop.format ?? '').endsWith('[]');
    const optional = kind === 'Update' || nullable || hasDefault;
    return `${key(col)}${optional ? '?' : ''}: ${t}${nullable ? ' | null' : ''}`;
  });
  return lines.length ? `{\n${indent(2, lines.join('\n'))}\n}` : 'Record<PropertyKey, never>';
}

function relBlock(rels) {
  if (!rels.length) return '[]';
  const items = rels.map(
    (r) => `{
  foreignKeyName: ${JSON.stringify(r.foreignKeyName)}
  columns: [${r.columns.map((c) => JSON.stringify(c)).join(', ')}]
  isOneToOne: ${r.isOneToOne}
  referencedRelation: ${JSON.stringify(r.referencedRelation)}
  referencedColumns: [${r.referencedColumns.map((c) => JSON.stringify(c)).join(', ')}]
}`,
  );
  return `[\n${indent(2, items.join(',\n'))}\n]`;
}

const definitions = spec.definitions ?? {};
const paths = spec.paths ?? {};
// PostgREST advertises POST only on relations it can insert into — that is what
// separates the tables from the read-only views here.
const isView = (name) => !paths[`/${name}`]?.post;

const tables = [];
const views = [];
for (const name of Object.keys(definitions).sort()) {
  const def = definitions[name];
  const rels = nest(2, relBlock(relationships(name, def)));
  if (isView(name)) {
    views.push(`${key(name)}: {\n  Row: ${nest(2, block(def, 'Row'))}\n  Relationships: ${rels}\n}`);
  } else {
    tables.push(
      `${key(name)}: {\n  Row: ${nest(2, block(def, 'Row'))}\n  Insert: ${nest(2, block(def, 'Insert'))}\n  Update: ${nest(2, block(def, 'Update'))}\n  Relationships: ${rels}\n}`,
    );
  }
}

const fns = [];
for (const [p, ops] of Object.entries(paths)) {
  if (!p.startsWith('/rpc/') || !ops.post) continue;
  const argRef = (ops.post.parameters ?? []).find((x) => x.in === 'body')?.schema?.$ref?.replace('#/definitions/', '');
  const args = argRef && definitions[argRef] ? block(definitions[argRef], 'Insert') : 'Record<PropertyKey, never>';
  fns.push(`${key(p.slice(5))}: {\n  Args: ${nest(2, args)}\n  Returns: unknown\n}`);
}

const body = `// Generated by \`npm run db:types\` from the live Supabase project — do not edit by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
${indent(6, tables.join('\n'))}
    }
    Views: {
${indent(6, views.join('\n'))}
    }
    Functions: {
${indent(6, fns.join('\n'))}
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[T] extends { Row: infer R } ? R : never
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Insert: infer I } ? I : never
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Update: infer U } ? U : never
`;

write('the project OpenAPI schema', body);
