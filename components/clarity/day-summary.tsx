import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleOff,
  RotateCcw,
} from "lucide-react";

import type { DaySummary as DaySummaryData } from "@/lib/clarity/schemas";
import {
  formatScheduledTime,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { Button } from "@/components/ui/button";

export function DaySummary({
  summary,
  notes,
  timezone,
}: {
  summary: DaySummaryData;
  notes: string | null;
  timezone: string;
}) {
  const completedActions = [...summary.completedActions].sort(
    (left, right) => {
      const leftTime = left.completedAt
        ? new Date(left.completedAt).getTime()
        : null;
      const rightTime = right.completedAt
        ? new Date(right.completedAt).getTime()
        : null;

      if (leftTime !== null && rightTime !== null) {
        return leftTime - rightTime;
      }

      if (leftTime !== null) return -1;
      if (rightTime !== null) return 1;
      return 0;
    },
  );
  const context =
    summary.contextSummary ??
    (summary.recordType !== "reconciled" ? notes : null);
  const madeProgressActions = summary.unfinishedActions.filter(
    (action) => action.outcome === "made_progress",
  );
  const notDoneActions = summary.unfinishedActions.filter(
    (action) => action.outcome === "not_done",
  );
  const resolvedElsewhereActions = summary.unfinishedActions.filter(
    (action) => action.outcome === "resolved_elsewhere",
  );
  const closedActions = summary.unfinishedActions.filter(
    (action) => action.outcome === "closed",
  );
  const changedActions = summary.unfinishedActions.filter(
    (action) =>
      action.outcome === "rescheduled" ||
      action.outcome === "dropped",
  );

  return (
    <section className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">Day Summary</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Progress recorded.
        </h1>
        {summary.focus && (
          <p className="max-w-xl pt-0.5 text-lg leading-7 text-muted-foreground">
            {summary.focus}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-4 text-[var(--clarity-completed)]">
          <p className="text-3xl font-semibold leading-none">
            {summary.completedCount}
          </p>
          <p className="mt-1 text-sm">Done</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-foreground">
          <p className="text-3xl font-semibold leading-none">
            {summary.unfinishedActions.length}
          </p>
          <p className="mt-1 text-sm">Changed</p>
        </div>
      </div>

      {completedActions.length > 0 && (
        <SummarySection title="Done">
          {completedActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-[var(--clarity-completed)]" />
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                {action.completedAt ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatScheduledTime(action.completedAt, timezone)}
                  </p>
                ) : action.completionTimeUnknown ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Completed {formatWeekday(summary.localDate)} · Time not
                    recorded
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {madeProgressActions.length > 0 && (
        <SummarySection title="Some progress">
          {madeProgressActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              <RotateCcw className="size-5 shrink-0 text-[var(--clarity-completed)]" />
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Some progress
                  {action.progressNote
                    ? ` · ${action.progressNote}`
                    : ""}
                </p>
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {notDoneActions.length > 0 && (
        <SummarySection title="Didn’t happen">
          {notDoneActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              <CircleOff className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Didn’t happen
                </p>
                {action.notDoneNote && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {action.notDoneNote}
                  </p>
                )}
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {resolvedElsewhereActions.length > 0 && (
        <SummarySection title="No longer needed">
          {resolvedElsewhereActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              <CircleOff className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  No longer needed
                </p>
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {closedActions.length > 0 && (
        <SummarySection title="Removed from plan">
          {closedActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              <CircleOff className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Removed from plan
                </p>
                {action.closeContext && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {action.closeContext}
                  </p>
                )}
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {(summary.unplannedProgress?.length ?? 0) > 0 && (
        <SummarySection title="Also recorded">
          {summary.unplannedProgress?.map((item, index) =>
            typeof item === "string" ? (
              <li
                key={`${item}-${index}`}
                className="flex min-h-11 items-center leading-6"
              >
                {item}
              </li>
            ) : (
              <li
                key={`${item.title}-${index}`}
                className="flex min-h-11 items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {unplannedOutcomeLabel(item, timezone)}
                  </p>
                </div>
              </li>
            ),
          )}
        </SummarySection>
      )}

      {changedActions.length > 0 && (
        <SummarySection title="Changed or unfinished">
          {changedActions.map((action) => (
            <li key={action.id} className="flex min-h-11 items-center gap-3">
              {action.outcome === "rescheduled" ? (
                <RotateCcw className="size-5 shrink-0 text-[var(--clarity-completed)]" />
              ) : (
                <CircleOff className="size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <Link
                  href={`/today/actions/${action.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {action.title}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {action.progressLevel
                    ? `Made progress · ${progressLabel(action.progressLevel)}`
                    : action.outcome === "rescheduled" &&
                        action.rescheduledFor
                      ? `Moved to ${formatWeekday(action.rescheduledFor)}`
                    : summary.recordType === "reconciled"
                      ? "Dropped during recap"
                      : "Dropped"}
                </p>
              </div>
            </li>
          ))}
        </SummarySection>
      )}

      {summary.totalCount > 0 &&
        summary.unfinishedActions.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 leading-7 text-[var(--clarity-completed)]">
            Everything in today&apos;s approved plan was completed.
          </div>
        )}

      {context && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Context
          </h2>
          <p className="mt-2 whitespace-pre-wrap leading-7">{context}</p>
        </div>
      )}

      <Button asChild size="lg" className="h-12 w-full rounded-xl text-base">
        <Link href="/today">
          Done
          <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}

function unplannedOutcomeLabel(
  item: NonNullable<DaySummaryData["unplannedProgress"]>[number] & object,
  timezone: string,
) {
  if (item.outcome === "finished") {
    return item.completedAt
      ? `Finished · ${formatScheduledTime(item.completedAt, timezone)}`
      : "Finished · Time not recorded";
  }

  return item.progressNote
    ? `Made progress · ${item.progressNote}`
    : "Made progress";
}

function progressLabel(
  value:
    | "started"
    | "part_way_through"
    | "nearly_finished"
    | "blocked"
    | null
    | undefined,
) {
  switch (value) {
    case "started":
      return "Started";
    case "part_way_through":
      return "Part-way through";
    case "nearly_finished":
      return "Nearly finished";
    case "blocked":
      return "Blocked";
    default:
      return "Progress recorded";
  }
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <ul className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {children}
      </ul>
    </section>
  );
}
