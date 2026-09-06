import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

/** Dashboard section: quiet title row, optional link to the module, optional right-side aside. Not every element is a card. */
export function Section({ title, href, aside, children }: { title: string; href?: string; aside?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">{title}</h2>
        <div className="flex items-center gap-3 text-sm text-ink-3">{aside && <span className="tabular-nums">{aside}</span>}{href && <Link href={href} className="inline-flex items-center gap-0.5 hover:text-ink"><ArrowUpRight className="h-3.5 w-3.5" /></Link>}</div>
      </div>
      {children}
    </section>
  );
}
