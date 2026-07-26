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
    <section className="space-y-8">
      <div className="rounded-3xl bg-[#148bff] p-6 text-white shadow-sm sm:p-8">
        <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-white/10">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="text-sm font-medium text-white/65">Today Closed</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">
          {formatWeekday(summary.localDate)} closed
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-3xl font-semibold">{summary.completedCount}</p>
            <p className="mt-1 text-sm text-white/70">Completed</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-3xl font-semibold">
              {summary.unfinishedActions.length}
            </p>
            <p className="mt-1 text-sm text-white/70">
              Rescheduled or dropped
            </p>
          </div>
        </div>
      </div>

      <Button
        asChild
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl border-sky-200/25 bg-transparent text-base text-[#38a5ff]"
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
          className="h-11 w-full rounded-xl text-blue-100/70 hover:bg-white/5 hover:text-white"
        >
          Undo close
        </Button>
      </form>
    </section>
  );
}
