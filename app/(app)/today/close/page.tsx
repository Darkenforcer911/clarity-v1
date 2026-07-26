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

  return (
    <section className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-medium text-blue-100/60">Close Day</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Record what happened.
        </h1>
        <p className="max-w-xl leading-7 text-blue-100/60">
          Keep the progress, then decide what happens to anything unfinished.
        </p>
      </div>

      <CloseDayForm
        completedActions={data.actions.filter(
          (action) => action.status === "completed",
        )}
        unfinishedActions={data.actions.filter((action) =>
          ["active", "rescheduled", "dropped"].includes(action.status),
        )}
        tomorrow={dailyLoopService.tomorrowFor(data)}
      />
    </section>
  );
}
