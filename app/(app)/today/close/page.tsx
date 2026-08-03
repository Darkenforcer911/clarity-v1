import { Suspense } from "react";

import { CloseDayForm } from "@/components/clarity/close-day-form";
import { PageLoading } from "@/components/clarity/page-loading";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  loadTodayForRoute,
  redirectFromClose,
} from "../route-guards";

export default function CloseDayPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CloseDayContent />
    </Suspense>
  );
}

async function CloseDayContent() {
  const data = await loadTodayForRoute();
  redirectFromClose(data);
  const completedActions = data.actions.filter(
    (action) => action.status === "completed",
  );
  const unfinishedActions = data.actions.filter(
    (action) => action.approved_at && action.status === "active",
  );

  return (
    <section className="w-full min-w-0 max-w-full space-y-7 pt-[env(safe-area-inset-top)]">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Close Day</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Record what happened.
        </h1>
        <p className="max-w-xl leading-7 text-muted-foreground">
          {unfinishedActions.length > 0
            ? "Keep the progress, then decide what happens to anything unfinished."
            : "Keep the progress and add any final note you want Clarity to remember."}
        </p>
      </div>

      <CloseDayForm
        planId={data.plan!.id}
        completedActions={completedActions}
        unfinishedActions={unfinishedActions}
        tomorrow={dailyLoopService.tomorrowFor(data)}
      />
    </section>
  );
}
