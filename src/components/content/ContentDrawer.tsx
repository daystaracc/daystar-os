'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createContent, updateContent } from '@/app/(app)/content/actions';
import { CONTENT_TYPE, CONTENT_PLATFORM, CONTENT_STATUS, type ContentType, type ContentPlatform, type ContentStatus } from '@/lib/content/constants';

export interface ContentDrawerOptions {
  owners: { id: string; name: string }[]; products: { id: string; name: string }[]; campaigns: { id: string; name: string }[];
  /** Added 2026-10-02 (migration 0012) — see content/page.tsx's doc comment. */
  pillars: { id: string; name: string; color: string }[];
}

export interface ContentDrawerLabels {
  newContent: string; editContent: string; title: string; type: string; platform: string; owner: string; product: string;
  status: string; talent: string; concept: string; hook: string; shootDate: string; publishDate: string; url: string; notes: string;
  noOwner: string; noProduct: string; campaign: string; noCampaign: string; pillar: string; noPillar: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  typeLabels: Record<ContentType, string>; platformLabels: Record<ContentPlatform, string>; statusLabels: Record<ContentStatus, string>;
  advanced: string;
}

export interface ContentDraft {
  id: string; title: string; type: ContentType; platform: ContentPlatform; status: ContentStatus;
  ownerId: string; productId: string; campaignId: string; pillarId: string; talent: string; concept: string; hook: string;
  shootDate: string; publishDate: string; url: string; notes: string;
}

/**
 * Create/edit drawer for a content piece. Visible fields: title, Pillar (full width —
 * the main categorization axis as of migration 0012, 2026-10-02), then
 * type/platform/owner/product in a grid, plus Advanced — same disclosure rule as
 * `ProductDrawer.tsx` / `ProjectDrawer.tsx`. New content always starts at `idea`; the
 * status field only appears when editing (moving stages has its own quick control on
 * the list — see `ContentActions.tsx`). The Pillar select has no inline "add new" —
 * pillars are managed from the page toolbar's "Manage pillars" panel
 * (`PillarManager.tsx`), same separation Campaigns keeps from this drawer's own
 * Campaign select.
 */
export function ContentDrawer({ options, labels, content, onCloseHref }: {
  options: ContentDrawerOptions; labels: ContentDrawerLabels; content?: ContentDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!content;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(content?.title ?? '');
  const [type, setType] = useState<ContentType>(content?.type ?? 'short_video');
  const [platform, setPlatform] = useState<ContentPlatform>(content?.platform ?? 'instagram');
  const [status, setStatus] = useState<ContentStatus>(content?.status ?? 'idea');
  const [ownerId, setOwnerId] = useState(content?.ownerId ?? '');
  const [productId, setProductId] = useState(content?.productId ?? '');
  const [campaignId, setCampaignId] = useState(content?.campaignId ?? '');
  const [pillarId, setPillarId] = useState(content?.pillarId ?? '');
  const [talent, setTalent] = useState(content?.talent ?? '');
  const [concept, setConcept] = useState(content?.concept ?? '');
  const [hook, setHook] = useState(content?.hook ?? '');
  const [shootDate, setShootDate] = useState(content?.shootDate ?? '');
  const [publishDate, setPublishDate] = useState(content?.publishDate ?? '');
  const [url, setUrl] = useState(content?.url ?? '');
  const [notes, setNotes] = useState(content?.notes ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const base = {
        title, content_type: type, platform, owner_id: ownerId, product_id: productId, campaign_id: campaignId, pillar_id: pillarId,
        talent, concept, hook, shoot_date: shootDate, publish_date: publishDate, url, notes,
        ...(editing ? { status } : {}),
      };
      const res = editing ? await updateContent(content.id, base) : await createContent(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="ct-drawer-scrim absolute inset-0" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editContent : labels.newContent}
        className="ct-drawer-panel relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-5" style={{ borderBottom: '1px solid var(--ct-hairline)' }}>
          <h2 className="ct-eyebrow text-sm">{editing ? labels.editContent : labels.newContent}</h2>
          <button onClick={close} aria-label={labels.close} className="ct-btn ct-btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="ct-pill ct-pill-bad rounded-md px-3 py-2 text-sm">{error}</p>}

            <Field label={labels.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="ct-input" />
            </Field>

            <Field label={labels.pillar}>
              <select value={pillarId} onChange={e => setPillarId(e.target.value)} className="ct-input">
                <option value="">{labels.noPillar}</option>
                {options.pillars.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.type}>
                <select value={type} onChange={e => setType(e.target.value as ContentType)} className="ct-input">
                  {CONTENT_TYPE.map(t => <option key={t} value={t}>{labels.typeLabels[t]}</option>)}
                </select>
              </Field>
              <Field label={labels.platform}>
                <select value={platform} onChange={e => setPlatform(e.target.value as ContentPlatform)} className="ct-input">
                  {CONTENT_PLATFORM.map(p => <option key={p} value={p}>{labels.platformLabels[p]}</option>)}
                </select>
              </Field>
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="ct-input">
                  <option value="">{labels.noOwner}</option>
                  {options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label={labels.product}>
                <select value={productId} onChange={e => setProductId(e.target.value)} className="ct-input">
                  <option value="">{labels.noProduct}</option>
                  {options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 pt-4 text-sm ct-muted hover:text-current"
              style={{ borderTop: '1px solid var(--ct-hairline)' }}>
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                {editing && (
                  <Field label={labels.status}>
                    <select value={status} onChange={e => setStatus(e.target.value as ContentStatus)} className="ct-input">
                      {CONTENT_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.talent}>
                    <input maxLength={200} value={talent} onChange={e => setTalent(e.target.value)} className="ct-input" />
                  </Field>
                  <Field label={labels.hook}>
                    <input maxLength={500} value={hook} onChange={e => setHook(e.target.value)} className="ct-input" />
                  </Field>
                  <Field label={labels.campaign}>
                    <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="ct-input">
                      <option value="">{labels.noCampaign}</option>
                      {options.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label={labels.shootDate}>
                    <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} className="ct-input" />
                  </Field>
                  <Field label={labels.publishDate}>
                    <input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} className="ct-input" />
                  </Field>
                </div>
                <Field label={labels.concept}>
                  <textarea rows={3} maxLength={2000} value={concept} onChange={e => setConcept(e.target.value)} className="ct-input h-auto py-2 leading-relaxed" />
                </Field>
                <Field label={labels.url}>
                  <input type="url" maxLength={1000} value={url} onChange={e => setUrl(e.target.value)} className="ct-input" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} className="ct-input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--ct-hairline)' }}>
            <button type="button" onClick={close} className="ct-btn">{labels.cancel}</button>
            <button type="submit" disabled={pending || !title.trim()} className="ct-btn ct-btn-primary">
              {pending ? labels.saving : editing ? labels.save : labels.create}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
