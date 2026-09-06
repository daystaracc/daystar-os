'use client';
import { useEffect } from 'react';
import { useT } from '@/lib/i18n/client';

/** Route-level fallback: a render or data failure keeps the shell and offers a retry. */
export default function TasksError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card grid place-items-center gap-3 px-6 py-14 text-center">
      <p className="text-sm text-ink-2">{t('tasks.loadFailed')}</p>
      {error.digest && <p className="font-mono text-xs text-ink-3">{error.digest}</p>}
      <button onClick={reset} className="btn-outline">{t('tasks.retry')}</button>
    </div>
  );
}
