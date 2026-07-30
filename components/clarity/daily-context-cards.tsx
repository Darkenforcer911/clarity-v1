import { History, RotateCcw } from "lucide-react";

import type {
  DailyAction,
  DayRecord,
} from "@/lib/clarity/daily-loop-queries";
import { daySummarySchema } from "@/lib/clarity/schemas";

export function DailyContextCards({
  rescheduledActions,
  yesterdayRecord,
}: {
  rescheduledActions: DailyAction[];
  yesterdayRecord: DayRecord | null;
}) {
  const yesterdaySummary = yesterdayRecord
    ? daySummarySchema.safeParse(yesterdayRecord.progress_recorded)
    : null;

  if (
    rescheduledActions.length === 0 &&
    (!yesterdaySummary || !yesterdaySummary.success)
  ) {
    return null;
  }

  return (
    <aside className="mb-6 grid gap-3">
      {rescheduledActions.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <RotateCcw className="size-4 text-[var(--clarity-completed)]" />
            Carried into today
          </div>
          <ul className="mt-3 space-y-2">
            {rescheduledActions.map((action) => (
              <li key={action.id} className="text-sm text-foreground">
                {action.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {yesterdaySummary?.success && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <History className="size-4" />
            Yesterday
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {yesterdaySummary.data.completedCount} of{" "}
            {yesterdaySummary.data.totalCount} approved actions completed.
          </p>
        </section>
      )}
    </aside>
  );
}
