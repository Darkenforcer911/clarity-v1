import { Suspense } from "react";

import { ActiveToday } from "@/components/clarity/active-today";
import { PageLoading } from "@/components/clarity/page-loading";
import { TodayHeader } from "@/components/clarity/today-header";
import {
  loadTodayForRoute,
  redirectFromActive,
} from "../route-guards";

export default function ActiveTodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ActiveTodayContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ActiveTodayContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadTodayForRoute();
  const query = await searchParams;
  redirectFromActive(data);

  if (!data.plan) {
    return null;
  }

  const requestedRemovedActionId =
    query.notice === "removed" && typeof query.actionId === "string"
      ? query.actionId
      : null;
  const initialRemovedActionId = data.actions.some(
    (action) =>
      action.id === requestedRemovedActionId &&
      action.status === "dropped" &&
      action.resolution_note === "Removed from today",
  )
    ? requestedRemovedActionId
    : null;

  return (
    <>
      <TodayHeader
        timezone={data.profile.timezone}
        name={data.profile.name}
      />
      <ActiveToday
        plan={data.plan}
        actions={data.actions}
        carriedActions={data.carriedActions}
        profile={data.profile}
        initialRemovedActionId={initialRemovedActionId}
        initialNow={new Date().toISOString()}
        commitments={data.commitments}
      />
    </>
  );
}
