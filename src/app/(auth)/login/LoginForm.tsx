'use client';
import { useActionState } from 'react';
import { signIn } from './actions';

export function LoginForm({ next, labels }: { next?: string; labels: Record<'email' | 'password' | 'signIn' | 'forgot' | 'invalid', string> }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card card-pad space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{labels.email}</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{labels.password}</span>
        <input name="password" type="password" autoComplete="current-password" required minLength={6} className="input" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-bad">{labels.invalid}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">{labels.signIn}</button>
      <a href="/reset-password" className="block text-center text-sm text-ink-3 hover:text-ink">{labels.forgot}</a>
    </form>
  );
}
