import { Suspense } from "react";

import { PageLoading } from "@/components/clarity/page-loading";
import { TodayGateway } from "@/components/clarity/today-gateway";
import { formatWeekday } from "@/lib/clarity/date-time";
import { resolveTodayGatewayPrimaryAction } from "@/lib/clarity/today-gateway";
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
  const currentDay = formatWeekday(data.localDate);
  const unresolvedApprovedDay =
    data.previousDayTransition?.kind === "wrap_up"
      ? formatWeekday(data.previousDayTransition.localDate)
      : null;
  const primaryAction = resolveTodayGatewayPrimaryAction({
    currentDay,
    unresolvedApprovedDay,
    hasPendingReturnGap: data.pendingReturnGap !== null,
    planStatus: data.plan?.status ?? null,
  });

  return (
    <TodayGateway
      primaryAction={primaryAction}
      currentLocalDate={data.localDate}
      timezone={data.profile.timezone}
      initialNow={new Date().toISOString()}
    />
  );
}
