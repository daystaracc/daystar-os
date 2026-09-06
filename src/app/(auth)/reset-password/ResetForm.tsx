'use client';
import { useActionState } from 'react';
import { requestPasswordReset } from '../login/actions';

/** Requests a Supabase reset email. The reply is deliberately identical whether or not the address exists. */
export function ResetForm({ labels }: { labels: Record<'email' | 'reset' | 'sent' | 'back', string> }) {
  const [sent, action, pending] = useActionState(requestPasswordReset, false);
  if (sent) {
    return (
      <div className="card card-pad space-y-4">
        <p role="status" className="text-sm text-ink-2">{labels.sent}</p>
        <a href="/login" className="btn-outline w-full">{labels.back}</a>
      </div>
    );
  }
  return (
    <form action={action} className="card card-pad space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <button type="submit" disabled={pending} className="btn-primary w-full">{labels.reset}</button>
      <a href="/login" className="block text-center text-sm text-ink-3 hover:text-ink">{labels.back}</a>
    </form>
  );
}
