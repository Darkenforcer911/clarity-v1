import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ActiveToday } from "@/components/clarity/active-today";
import { DailyContextCards } from "@/components/clarity/daily-context-cards";
import { PageLoading } from "@/components/clarity/page-loading";
import { TodayHeader } from "@/components/clarity/today-header";
import { TodayClosed } from "@/components/clarity/today-closed";
import { TodayUnshaped } from "@/components/clarity/today-unshaped";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import { loadTodayForRoute } from "./route-guards";

export default function TodayPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TodayContent />
    </Suspense>
  );
}

async function TodayContent() {
  const data = await loadTodayForRoute();
  const context = (
    <>
      <TodayHeader timezone={data.profile.timezone} name={data.profile.name} />
      <DailyContextCards
        rescheduledActions={data.rescheduledContext}
        yesterdayRecord={data.yesterdayRecord}
      />
    </>
  );

  switch (data.plan?.status) {
    case "proposed":
      redirect("/today/plan");
    case "active":
      return (
        <>
          {context}
          <ActiveToday
            plan={data.plan}
            actions={data.actions}
            profile={data.profile}
          />
        </>
      );
    case "closing":
      redirect("/today/close");
    case "closed":
      return (
        <>
          {context}
          <TodayClosed
            planId={data.plan.id}
            summary={dailyLoopService.parseDaySummary(data)}
          />
        </>
      );
    default:
      return (
        <>
          {context}
          <TodayUnshaped />
        </>
      );
  }
}
