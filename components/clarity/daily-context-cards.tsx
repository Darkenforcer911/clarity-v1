import { RotateCcw } from "lucide-react";

import type { DailyAction } from "@/lib/clarity/daily-loop-queries";

export function DailyContextCards({
  rescheduledActions,
}: {
  rescheduledActions: DailyAction[];
}) {
  if (rescheduledActions.length === 0) {
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
    </aside>
  );
}
