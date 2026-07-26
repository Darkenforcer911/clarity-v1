import { Suspense } from "react";

import { DaySummary } from "@/components/clarity/day-summary";
import { PageLoading } from "@/components/clarity/page-loading";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import {
  loadTodayForRoute,
  redirectFromSummary,
} from "../route-guards";

export default function DaySummaryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DaySummaryContent />
    </Suspense>
  );
}

async function DaySummaryContent() {
  const data = await loadTodayForRoute();
  redirectFromSummary(data);

  return (
    <DaySummary
      summary={dailyLoopService.parseDaySummary(data)}
      notes={data.dayRecord?.notes ?? null}
    />
  );
}
