import Link from "next/link";

export default function CalendarPlaceholderPage() {
  return (
    <section className="space-y-6 pt-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Calendar
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Plan ahead
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Calendar planning is coming soon. Today has not been started.
        </p>
      </div>

      <Link
        href="/today"
        className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-[var(--clarity-completed)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to Today
      </Link>
    </section>
  );
}
