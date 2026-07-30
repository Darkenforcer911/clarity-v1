import Link from "next/link";
import { CloudOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <CloudOff className="mx-auto size-9 text-[var(--clarity-completed)]" />
        <h1 className="mt-5 text-2xl font-semibold">Clarity is offline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Reconnect to load your latest plan and safely update your day.
        </p>
        <Link
          href="/today"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
