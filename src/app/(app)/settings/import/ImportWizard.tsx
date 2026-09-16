'use client';

import { useState, useTransition } from 'react';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parseCsv } from '@/lib/import/csv';
import { parseShowmoreProducts, type ShowmoreProductsParseResult } from '@/lib/import/showmoreProducts';
import { importShowmoreProducts, type ImportOutcome } from './actions';

export interface WizardLabels {
  choose: string; chooseHint: string; parsing: string; reparse: string;
  previewTitle: string; products: string; variants: string; units: string;
  costed: string; uncosted: string; attributes: string; freeText: string;
  warnings: string; confirm: string; importing: string; cancel: string;
  doneTitle: string; created: string; updated: string; unchanged: string;
  nothing: string; failed: string;
}

/**
 * Product-master import: choose a file → see exactly what it contains → confirm.
 *
 * The preview is produced in the browser by the same pure parser the server action
 * runs on the raw text, so nothing is written on the strength of a number the user
 * has not already seen. Nothing at all is written until Confirm.
 */
export function ImportWizard({ labels }: { labels: WizardLabels }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ShowmoreProductsParseResult | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setOutcome(null);
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setPreview(parseShowmoreProducts(parseCsv(content)));
  }

  function confirm() {
    if (!text) return;
    startTransition(async () => {
      const result = await importShowmoreProducts(text);
      setOutcome(result);
      if (result.ok) { setPreview(null); setText(null); }
    });
  }

  const empty = preview && preview.products.length === 0;

  return (
    <div className="space-y-6">
      <div className="card card-pad">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="btn-outline"><Upload className="h-4 w-4" />{labels.choose}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only"
            onChange={e => void onFile(e.target.files?.[0])} />
          <span className="min-w-0 truncate text-sm text-ink-3">{fileName || labels.chooseHint}</span>
        </label>
      </div>

      {outcome && (
        <div className={`card card-pad ${outcome.ok ? '' : 'border border-bad'}`}>
          <div className="flex items-start gap-2">
            {outcome.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
            <div className="min-w-0">
              <div className="text-sm font-medium">{outcome.ok ? labels.doneTitle : labels.failed}</div>
              {outcome.message && <p className="mt-1 text-sm text-ink-2">{outcome.message}</p>}
              {outcome.summary && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Stat label={labels.created} value={`${outcome.summary.productsNew} / ${outcome.summary.variantsNew}`} />
                  <Stat label={labels.updated} value={`${outcome.summary.productsUpdated} / ${outcome.summary.variantsUpdated}`} />
                  <Stat label={labels.units} value={`+${outcome.summary.unitsIn} / −${outcome.summary.unitsOut}`} />
                </dl>
              )}
            </div>
          </div>
        </div>
      )}

      {empty && (
        <div className="card card-pad border border-bad">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
            <p className="text-sm text-ink-2">{preview.warnings[0] ?? labels.nothing}</p>
          </div>
        </div>
      )}

      {preview && preview.products.length > 0 && (
        <div className="card card-pad space-y-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">{labels.previewTitle}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <Stat label={labels.products} value={preview.totals.products.toLocaleString('en-US')} big />
              <Stat label={labels.variants} value={preview.totals.variants.toLocaleString('en-US')} big />
              <Stat label={labels.units} value={preview.totals.onHand.toLocaleString('en-US')} big />
              <Stat label={labels.costed} value={`${preview.totals.costed} / ${preview.totals.variants}`} big />
            </dl>
            <p className="mt-2 text-xs text-ink-3">{labels.uncosted.replace('{n}', String(preview.totals.uncosted))}</p>
          </div>

          <div>
            <div className="label mb-2">{labels.attributes}</div>
            <div className="flex flex-wrap gap-1.5">
              {preview.attributeNames.map(a => (
                <span key={a.rawName} className={`pill ${a.key ? 'pill-neutral' : 'pill-warn'}`}>
                  {a.rawName} → {a.key ?? labels.freeText} · {a.variants}
                </span>
              ))}
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div>
              <div className="label mb-2">{labels.warnings}</div>
              <ul className="space-y-1 text-sm text-ink-2">
                {preview.warnings.map(w => (
                  <li key={w} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />{w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <button className="btn-primary" onClick={confirm} disabled={pending}>
              {pending ? labels.importing : labels.confirm}
            </button>
            <button className="btn-ghost" onClick={() => { setPreview(null); setText(null); setFileName(''); }} disabled={pending}>
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className={`tabular-nums ${big ? 'text-xl font-semibold' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}
