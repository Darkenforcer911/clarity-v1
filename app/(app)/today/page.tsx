import { Suspense } from "react";
import { redirect } from "next/navigation";

import { ActiveToday } from "@/components/clarity/active-today";
import { DailyContextCards } from "@/components/clarity/daily-context-cards";
import { PageLoading } from "@/components/clarity/page-loading";
import { NewDayBriefing } from "@/components/clarity/new-day-briefing";
import { TodayHeader } from "@/components/clarity/today-header";
import { TodayClosed } from "@/components/clarity/today-closed";
import { TodayUnshaped } from "@/components/clarity/today-unshaped";
import { PreviousDayTransition } from "@/components/clarity/previous-day-transition";
import { dailyLoopService } from "@/lib/clarity/daily-loop-service";
import { newDayBriefingService } from "@/lib/clarity/new-day-briefing";
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

  if (data.previousDayTransition) {
    return <PreviousDayTransition transition={data.previousDayTransition} />;
  }

  if (data.pendingReturnGap) {
    redirect("/today/catch-up/gap");
  }

  const header = (
    <TodayHeader
      timezone={data.profile.timezone}
      name={data.profile.name}
    />
  );
  const planningContext = (
    <DailyContextCards
      rescheduledActions={data.rescheduledContext}
      yesterdayRecord={data.yesterdayRecord}
    />
  );
  const briefing =
    !data.plan || data.plan.status === "unshaped"
      ? await newDayBriefingService.build(data)
      : null;

  switch (data.plan?.status) {
    case "proposed":
      redirect("/today/plan");
    case "active":
      return (
        <>
          {header}
          <ActiveToday
            plan={data.plan}
            actions={data.actions}
            carriedActions={data.carriedActions}
            profile={data.profile}
          />
        </>
      );
    case "closing":
      return (
        <>
          {header}
          <ActiveToday
            plan={data.plan}
            actions={data.actions}
            carriedActions={data.carriedActions}
            profile={data.profile}
            isClosing
          />
        </>
      );
    case "closed":
      return (
        <>
          {header}
          <TodayClosed
            planId={data.plan.id}
            summary={dailyLoopService.parseDaySummary(data)}
          />
        </>
      );
    default:
      return briefing ? (
        <>
          {header}
          <NewDayBriefing
            briefing={briefing}
            currentLocalDate={data.localDate}
          />
        </>
      ) : (
        <>
          {header}
          {planningContext}
          <TodayUnshaped />
        </>
      );
  }
}
