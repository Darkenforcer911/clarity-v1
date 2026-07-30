import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { undoCloseDayAction } from "@/app/(app)/today/actions";
import type { DaySummary } from "@/lib/clarity/schemas";
import { formatWeekday } from "@/lib/clarity/date-time";

export function TodayClosed({
  planId,
  summary,
}: {
  planId: string;
  summary: DaySummary;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-secondary text-[var(--clarity-completed)]">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Today Closed</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
          {formatWeekday(summary.localDate)} closed
        </h1>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-secondary p-4">
            <p className="text-2xl font-semibold text-[var(--clarity-completed)]">
              {summary.completedCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Completed</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary p-4">
            <p className="text-2xl font-semibold">
              {summary.unfinishedActions.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Rescheduled or dropped
            </p>
          </div>
        </div>
      </div>

      <Button
        asChild
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-base"
      >
        <Link href="/today/summary">
          View summary
          <ArrowRight />
        </Link>
      </Button>

      <form action={undoCloseDayAction}>
        <input type="hidden" name="planId" value={planId} />
        <Button
          type="submit"
          variant="ghost"
          className="h-11 w-full rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Undo close
        </Button>
      </form>
    </section>
  );
}
