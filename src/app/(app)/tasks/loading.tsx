/** Skeleton while the server assembles the task list — same shape, so nothing jumps. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-2">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="ml-auto h-8 w-56 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="card divide-y divide-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="h-5 w-5 shrink-0 animate-pulse rounded-[5px] bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${70 - i * 5}%` }} />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
