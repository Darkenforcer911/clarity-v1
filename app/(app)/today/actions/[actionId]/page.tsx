import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ActionDetail } from "@/components/clarity/action-detail";
import { PageLoading } from "@/components/clarity/page-loading";
import { actionWorkspaceService } from "@/lib/clarity/action-workspace-service";
import {
  ActionNotFoundError,
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import { getLocalDate } from "@/lib/clarity/date-time";

export default function ActionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ actionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ActionDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ActionDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ actionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actionId } = await params;
  const query = await searchParams;
  let data;

  try {
    data = await actionWorkspaceService.getAction(actionId);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login");
    }

    if (error instanceof ActionNotFoundError) {
      notFound();
    }

    throw error;
  }

  const activeAction =
    data.plan.status === "active" &&
    actionWorkspaceService.isCurrentLocalPlan(
      data.plan.local_date,
      data.profile.timezone,
    ) &&
    ["active", "completed"].includes(data.action.status);
  const historicalAction =
    data.plan.status === "closed" &&
    ["completed", "rescheduled", "dropped"].includes(
      data.action.status,
    );

  if (!activeAction && !historicalAction) {
    redirect("/today");
  }

  const currentLocalDate = getLocalDate(data.profile.timezone);
  const calendarDate = firstQueryValue(query.date);
  const returnToCalendar =
    firstQueryValue(query.from) === "calendar" &&
    Boolean(calendarDate?.match(/^\d{4}-\d{2}-\d{2}$/));

  return (
    <ActionDetail
      action={data.action}
      plan={data.plan}
      profile={data.profile}
      lifeContext={data.lifeContext}
      updates={data.notes}
      readOnly={historicalAction}
      backHref={
        returnToCalendar
          ? `/calendar?date=${calendarDate}`
          : activeAction
          ? "/today/active"
          : historicalAction && data.plan.local_date === currentLocalDate
            ? "/today/summary"
            : "/today"
      }
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
