import { Clock3, Compass, Link2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageLoading } from "@/components/clarity/page-loading";
import { Button } from "@/components/ui/button";
import {
  parseClarityInvocation,
} from "@/lib/clarity/clarity-action-context";
import { actionWorkspaceService } from "@/lib/clarity/action-workspace-service";
import { getCalendarPageData } from "@/lib/clarity/calendar-service";
import {
  ActionNotFoundError,
  AuthenticationRequiredError,
} from "@/lib/clarity/daily-loop-queries";
import {
  formatFullLocalDate,
  formatScheduledTime,
} from "@/lib/clarity/date-time";
import { formatDuration } from "@/lib/clarity/duration";
import { applyHistoricalActionOutcomeRevisions } from "@/lib/clarity/historical-action-outcomes";

type ClarityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ClarityPage({ searchParams }: ClarityPageProps) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ClarityContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ClarityContent({ searchParams }: ClarityPageProps) {
  const invocation = parseClarityInvocation(await searchParams);
  const actionContext = invocation?.kind === "daily_action"
    ? await loadActionContext(invocation.actionId)
    : null;
  const dayContext = invocation?.kind === "day"
    ? await getCalendarPageData(invocation.localDate)
    : null;

  return (
    <div className="space-y-6" data-slot="clarity-conversation-skeleton">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          Clarity
        </h1>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Think through what matters, explore your options, and work out what
          to do next.
        </p>
      </header>

      {actionContext && <AttachedActionContext context={actionContext} />}
      {dayContext && <AttachedDayContext context={dayContext} />}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
          <Compass className="size-5" aria-hidden="true" />
        </div>
        <div className="mt-5 space-y-2">
          <h2 className="text-base font-semibold">
            Your conversation with Clarity will live here.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Conversation isn’t connected in this build yet.
          </p>
        </div>
      </section>
    </div>
  );
}

function AttachedDayContext({
  context,
}: {
  context: Awaited<ReturnType<typeof getCalendarPageData>>;
}) {
  const originalSummary = context.historicalRecord?.summary ?? null;
  const summary = originalSummary && context.historicalRecord
    ? applyHistoricalActionOutcomeRevisions(
        originalSummary,
        context.historicalRecord.actionOutcomeRevisions,
      )
    : null;
  const plannedCount = summary?.totalCount ?? context.dailyActions.length;
  const knownOutcomeCount = summary
    ? summary.completedActions.length + summary.unfinishedActions.length
    : context.dailyActions.filter((action) =>
        ["completed", "missed", "rescheduled", "dropped"].includes(
          action.status,
        ),
      ).length;
  const recapAddedCount = summary?.unplannedProgress?.length ?? 0;
  const correctionCount = context.corrections.filter(
    (correction) => correction.correction_type === "completed_item",
  ).length;
  const dayReflection =
    summary?.contextSummary ?? context.historicalRecord?.notes ?? null;
  const facts = [
    `${plannedCount} planned ${plannedCount === 1 ? "Action" : "Actions"}`,
    `${knownOutcomeCount} known ${knownOutcomeCount === 1 ? "outcome" : "outcomes"}`,
    `${context.commitments.length} Calendar ${context.commitments.length === 1 ? "commitment" : "commitments"}`,
    ...(recapAddedCount + correctionCount > 0
      ? [`${recapAddedCount + correctionCount} unplanned completed`]
      : []),
  ];

  return (
    <section
      className="rounded-2xl border border-primary/50 bg-secondary p-5"
      data-slot="clarity-day-context"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Clock3 className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Day attached
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
            {formatFullLocalDate(context.selectedDate)}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {facts.join(" · ")}
          </p>
          {dayReflection && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {dayReflection}
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        This date is ready as context for your conversation with Clarity. Saved
        outcomes, actual durations, Calendar commitments, completed extras, and
        the day reflection stay attached to their canonical records.
      </p>
      <Button asChild variant="ghost" className="mt-2 h-10 rounded-xl px-2">
        <Link href={`/calendar?date=${context.selectedDate}`}>View day</Link>
      </Button>
    </section>
  );
}

async function loadActionContext(actionId: string) {
  try {
    return await actionWorkspaceService.getAction(actionId);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login");
    }

    if (error instanceof ActionNotFoundError) {
      redirect("/clarity");
    }

    throw error;
  }
}

function AttachedActionContext({
  context,
}: {
  context: Awaited<ReturnType<typeof actionWorkspaceService.getAction>>;
}) {
  const scheduledTime = formatScheduledTime(
    context.action.scheduled_time,
    context.profile.timezone,
  );
  const meta = [
    scheduledTime ? `At ${scheduledTime}` : "Anytime",
    formatDuration(context.action.estimated_minutes),
    formatActionStatus(context.action.status),
  ];
  const relationships = [
    context.lifeContext.project
      ? `Project: ${context.lifeContext.project.title}`
      : null,
    context.lifeContext.routine
      ? `Routine: ${context.lifeContext.routine.title}`
      : null,
    context.lifeContext.goal ? `Goal: ${context.lifeContext.goal.title}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <section
      className="rounded-2xl border border-primary/50 bg-secondary p-5"
      data-slot="clarity-action-context"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Clock3 className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Action attached
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
            {context.action.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.join(" · ")}
          </p>
          {relationships.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{relationships.join(" · ")}</span>
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        This Action is ready as context for your conversation with Clarity.
      </p>
      <Button asChild variant="ghost" className="mt-2 h-10 rounded-xl px-2">
        <Link href={`/today/actions/${context.action.id}`}>View Action</Link>
      </Button>
    </section>
  );
}

function formatActionStatus(status: string) {
  const labels: Record<string, string> = {
    proposed: "Proposed",
    active: "Active",
    completed: "Completed",
    rescheduled: "Rescheduled",
    dropped: "Dropped",
  };

  return labels[status] ?? status;
}
