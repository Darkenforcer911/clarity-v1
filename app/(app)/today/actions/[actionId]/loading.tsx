export default function ActionWorkspaceLoading() {
  return (
    <section
      className="animate-pulse space-y-6"
      aria-label="Loading action"
      aria-busy="true"
    >
      <div className="h-10 w-32 rounded-xl bg-secondary" />

      <div className="space-y-3">
        <div className="h-9 w-4/5 rounded-lg bg-secondary" />
        <div className="h-5 w-48 rounded-md bg-secondary/80" />
      </div>

      <div className="h-12 w-full rounded-xl bg-primary/35" />

      <div className="space-y-5 rounded-2xl bg-card p-5">
        <div className="space-y-2">
          <div className="h-5 w-24 rounded-md bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary/80" />
          <div className="h-4 w-3/4 rounded bg-secondary/80" />
        </div>
        <div className="space-y-2">
          <div className="h-5 w-28 rounded-md bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary/80" />
          <div className="h-4 w-2/3 rounded bg-secondary/80" />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_3rem] gap-2">
        <div className="h-12 rounded-xl bg-primary/35" />
        <div className="h-12 rounded-xl bg-secondary" />
      </div>
    </section>
  );
}
