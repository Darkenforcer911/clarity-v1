import { notFound, redirect } from "next/navigation";

import { ActionDetail } from "@/components/clarity/action-detail";
import { actionWorkspaceService } from "@/lib/clarity/action-workspace-service";
import {
  ActionNotFoundError,
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import { getLocalDate } from "@/lib/clarity/date-time";

export default async function ActionDetailPage({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  return <ActionDetailContent params={params} />;
}

async function ActionDetailContent({
  params,
}: {
  params: Promise<{ actionId: string }>;
}) {
  const { actionId } = await params;
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

  return (
    <ActionDetail
      action={data.action}
      plan={data.plan}
      profile={data.profile}
      messages={data.messages}
      updates={data.notes}
      readOnly={historicalAction}
      backHref={
        activeAction
          ? "/today/active"
          : historicalAction && data.plan.local_date === currentLocalDate
            ? "/today/summary"
            : "/today"
      }
    />
  );
}
