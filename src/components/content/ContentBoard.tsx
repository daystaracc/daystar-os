'use client';
import Link from 'next/link';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import { updateContentStatus } from '@/app/(app)/content/actions';
import { CONTENT_STATUS, STATUS_GLYPH, type ContentStatus, type ContentType, type ContentPlatform } from '@/lib/content/constants';
import { DeleteContentButton, type ContentActionsLabels } from '@/components/content/ContentActions';
import { PILLAR_VAR, NO_PILLAR_VAR } from '@/components/content/pillarColors';
import type { ContentRow } from '@/lib/data/content';

/** Custom MIME type so the board only accepts its own cards — same idea as TaskBoard.tsx. */
const DRAG_TYPE = 'application/x-daystar-content';

export interface ContentBoardLabels {
  typeLabels: Record<ContentType, string>;
  platformLabels: Record<ContentPlatform, string>;
  noOwner: string;
  empty: string;
}

/**
 * Kanban across the four `content.status` pipeline stages (idea/planned/shot/posted —
 * collapsed from eight by migration 0012, see content/page.tsx's doc comment). Same
 * interaction model as TaskBoard.tsx: native HTML5 drag-and-drop, with a status
 * <select> on every card as the fallback — keyboard users and phones (where HTML5
 * drag does not fire) use that instead. Both paths call the same `updateContentStatus`
 * server action the List view's `ContentStatusControl` uses, so RLS is the real gate
 * either way; `canEdit` here only decides whether the card offers the controls at all.
 *
 * Columns are still status (production progress), not pillar — a kanban's columns are
 * inherently "where is this in the pipeline". Each card instead gets its *pillar*'s
 * color as a left accent + dot (same `PILLAR_VAR` map ContentCalendar uses), and each
 * column header shows its stage's glyph instead of a status color, since status is no
 * longer itself color-coded.
 */
export function ContentBoard({ items, actionsLabels, labels }: {
  items: ContentRow[]; actionsLabels: ContentActionsLabels; labels: ContentBoardLabels;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ContentStatus | null>(null);
  // A ref, not state: `dragging` has not committed yet when the drop handler runs.
  const draggedId = useRef<string | null>(null);
  const [, start] = useTransition();
  const [rows, patch] = useOptimistic(items, (state: ContentRow[], next: { id: string; status: ContentStatus }) =>
    state.map(c => (c.id === next.id ? { ...c, status: next.status } : c)));

  function move(id: string, status: ContentStatus) {
    const item = rows.find(c => c.id === id);
    if (!item || item.status === status || !item.canEdit) return;
    setError(null);
    start(async () => {
      patch({ id, status });
      const res = await updateContentStatus(id, status);
      if (!res.ok) setError(actionsLabels.saveFailed);
    });
  }

  if (!rows.length) return <div className="ct-card ct-card-pad text-sm ct-muted">{labels.empty}</div>;

  return (
    <div className="space-y-2">
      {error && <div className="rounded-md ct-pill ct-pill-bad px-3 py-2 text-sm">{error}</div>}
      {/* horizontal scroll keeps every column reachable on a phone */}
      <div className="-mx-6 overflow-x-auto px-6 pb-2 lg:-mx-10 lg:px-10">
        <div className="flex min-w-max gap-3">
          {CONTENT_STATUS.map(status => {
            const column = rows.filter(c => c.status === status);
            return (
              <section
                key={status}
                onDragOver={e => { if (draggedId.current || e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(status); } }}
                onDragLeave={() => setOver(o => (o === status ? null : o))}
                onDrop={e => {
                  e.preventDefault();
                  setOver(null);
                  setDragging(null);
                  const id = e.dataTransfer.getData(DRAG_TYPE) || draggedId.current;
                  draggedId.current = null;
                  if (id) move(id, status);
                }}
                aria-label={actionsLabels.statusLabels[status]}
                className={`ct-kanban-col flex w-[16rem] shrink-0 flex-col p-2 ${over === status ? 'is-over' : ''}`}>
                <header className="flex items-center justify-between px-1.5 pb-2">
                  <h3 className="ct-label flex items-center gap-1.5">
                    <span aria-hidden="true" className="ct-status-glyph">{STATUS_GLYPH[status]}</span>
                    {actionsLabels.statusLabels[status]}
                  </h3>
                  <span className="ct-mono text-[11px] tabular-nums ct-muted">{column.length}</span>
                </header>
                <ul className="flex flex-col gap-2">
                  {column.map(c => (
                    <li key={c.id}
                      draggable={c.canEdit}
                      onDragStart={e => { draggedId.current = c.id; setDragging(c.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData(DRAG_TYPE, c.id); } catch { /* scripted drags cannot write dataTransfer */ } }}
                      onDragEnd={() => { draggedId.current = null; setDragging(null); setOver(null); }}
                      className={`ct-kanban-card space-y-2 p-3 ${c.canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging === c.id ? 'opacity-40' : ''}`}
                      style={{ borderLeftColor: c.pillar ? PILLAR_VAR[c.pillar.color] : NO_PILLAR_VAR, borderLeftWidth: '3px' }}>
                      {c.canEdit ? (
                        <Link href={`?view=kanban&edit=${c.id}`} scroll={false} className="block text-sm leading-snug hover:underline">{c.title}</Link>
                      ) : (
                        <span className="block text-sm leading-snug">{c.title}</span>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs ct-muted">
                        {c.pillar && (
                          <span className="flex items-center gap-1">
                            <span className="ct-dot" style={{ background: PILLAR_VAR[c.pillar.color] }} />
                            {c.pillar.name}
                          </span>
                        )}
                        <span>{labels.typeLabels[c.type]}</span>
                        <span>{labels.platformLabels[c.platform]}</span>
                        {c.publishDate && <time dateTime={c.publishDate} className="ct-mono tabular-nums">{c.publishDate}</time>}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--ct-hairline)' }}>
                        <span className="truncate text-xs ct-muted">{c.owner?.name ?? labels.noOwner}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <select
                            value={c.status}
                            onChange={e => move(c.id, e.target.value as ContentStatus)}
                            disabled={!c.canEdit}
                            aria-label={actionsLabels.statusLabels[c.status]}
                            className="ct-input h-7 w-auto text-xs disabled:cursor-not-allowed disabled:opacity-50">
                            {CONTENT_STATUS.map(s => <option key={s} value={s}>{actionsLabels.statusLabels[s]}</option>)}
                          </select>
                          <DeleteContentButton id={c.id} canDelete={c.canDelete} labels={actionsLabels} />
                        </div>
                      </div>
                    </li>
                  ))}
                  {!column.length && (
                    <li className="grid h-16 place-items-center rounded-md text-xs ct-muted" style={{ border: '1px dashed var(--ct-hairline)' }}>—</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
