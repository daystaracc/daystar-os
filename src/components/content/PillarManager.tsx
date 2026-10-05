'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { createPillar, updatePillar, deletePillar } from '@/app/(app)/content/actions';
import { PILLAR_COLOR, type PillarColor } from '@/lib/content/constants';
import { PILLAR_VAR } from '@/components/content/pillarColors';

export interface Pillar { id: string; name: string; color: PillarColor }

export interface PillarManagerLabels {
  managePillars: string; newPillar: string; editPillar: string; pillarName: string; pillarColor: string;
  savePillar: string; cancel: string; create: string; close: string;
  deletePillar: string; deletePillarConfirm: string; pillarsEmpty: string; pillarSaveFailed: string;
  colorLabels: Record<PillarColor, string>;
}

/**
 * "Manage pillars" panel — the one place pillars (added 2026-10-02, migration 0012;
 * see content/page.tsx's doc comment) get created, renamed, recolored, or deleted.
 * Opened from a button next to the pillar filter chips on content/page.tsx. Create and
 * rename/recolor are manager-or-above (`canManage`, mirrors `pillars_insert`/
 * `pillars_update` RLS — same bar as Campaigns); delete is founder-only (`canDelete`,
 * mirrors `pillars_delete`). A member with neither flag never sees this component at
 * all — content/page.tsx only renders it for managers and above.
 *
 * A centered modal (`.ct-modal-panel`), not a right-side drawer like ContentDrawer —
 * this edits a short list of org-wide settings, not one content piece, so the drawer's
 * slide-over affordance (clearly "editing this one thing") would be the wrong signal.
 */
export function PillarManager({ pillars, canManage, canDelete, labels }: {
  pillars: Pillar[]; canManage: boolean; canDelete: boolean; labels: PillarManagerLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // New-pillar form state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<PillarColor>('gold');
  // Edit-in-place form state (only one row editable at a time)
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<PillarColor>('gold');

  function openEdit(p: Pillar) {
    setEditingId(p.id); setEditName(p.name); setEditColor(p.color); setError(null);
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    start(async () => {
      const res = await createPillar({ name: newName.trim(), color: newColor });
      if (!res.ok) { setError(labels.pillarSaveFailed); return; }
      setNewName(''); setNewColor('gold');
      router.refresh();
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    setError(null);
    start(async () => {
      const res = await updatePillar(editingId, { name: editName.trim(), color: editColor });
      if (!res.ok) { setError(labels.pillarSaveFailed); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!window.confirm(labels.deletePillarConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deletePillar(id);
      if (!res.ok) { setError(labels.pillarSaveFailed); return; }
      router.refresh();
    });
  }

  if (!canManage) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ct-btn ct-btn-ghost text-xs">
        {labels.managePillars}
      </button>

      {open && (
        <div className="ct-modal-scrim fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={labels.managePillars}
            className="ct-modal-panel p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between">
              <h2 className="ct-eyebrow text-sm">{labels.managePillars}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={labels.close} className="ct-btn ct-btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
            </header>

            {error && <p className="ct-pill ct-pill-bad rounded-md px-3 py-2 text-sm">{error}</p>}

            {pillars.length === 0 ? (
              <p className="text-sm ct-muted">{labels.pillarsEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {pillars.map(p => (
                  <li key={p.id} className="ct-card ct-card-pad space-y-2">
                    {editingId === p.id ? (
                      <form onSubmit={submitEdit} className="space-y-2">
                        <input autoFocus value={editName} maxLength={100} onChange={e => setEditName(e.target.value)} className="ct-input" aria-label={labels.pillarName} />
                        <SwatchPicker value={editColor} onChange={setEditColor} label={labels.pillarColor} colorLabels={labels.colorLabels} />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingId(null)} className="ct-btn text-xs">{labels.cancel}</button>
                          <button type="submit" disabled={pending || !editName.trim()} className="ct-btn ct-btn-primary text-xs">{labels.savePillar}</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="ct-dot" style={{ background: PILLAR_VAR[p.color] }} />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <button type="button" onClick={() => openEdit(p)} aria-label={labels.editPillar} className="ct-btn ct-btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></button>
                        {canDelete && (
                          <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={labels.deletePillar} className="ct-btn ct-btn-ghost ct-btn-danger h-7 w-7 shrink-0 px-0"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={submitNew} className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--ct-hairline)' }}>
              <h3 className="ct-label">{labels.newPillar}</h3>
              <input value={newName} maxLength={100} onChange={e => setNewName(e.target.value)} placeholder={labels.pillarName} className="ct-input" aria-label={labels.pillarName} />
              <SwatchPicker value={newColor} onChange={setNewColor} label={labels.pillarColor} colorLabels={labels.colorLabels} />
              <div className="flex justify-end">
                <button type="submit" disabled={pending || !newName.trim()} className="ct-btn ct-btn-primary text-xs">
                  <Plus className="h-3.5 w-3.5" />{labels.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** Pulled out to module scope (not nested in PillarManager) so its component identity
 * is stable across renders — a function component redefined every render would make
 * React remount it each time instead of just re-rendering. */
function SwatchPicker({ value, onChange, label, colorLabels }: {
  value: PillarColor; onChange: (c: PillarColor) => void; label: string; colorLabels: Record<PillarColor, string>;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      {PILLAR_COLOR.map(c => (
        <button key={c} type="button" aria-label={colorLabels[c]} aria-pressed={value === c}
          onClick={() => onChange(c)} className="ct-swatch" style={{ background: PILLAR_VAR[c] }} />
      ))}
    </div>
  );
}
