export function PageLoading() {
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="h-4 w-24 animate-pulse rounded-full bg-black/10" />
      <div className="h-10 w-3/4 animate-pulse rounded-xl bg-black/10" />
      <div className="h-40 animate-pulse rounded-3xl bg-black/5" />
    </div>
  );
}
