"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  beginCloseDayAction,
  markActionIncompleteAction,
  setActionCompletionAction,
} from "@/app/(app)/today/actions";
import type {
  CarriedAction,
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  addLocalDays,
  formatScheduledTime,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { Button } from "@/components/ui/button";
import { AddActionForm } from "./add-action-form";
import { PendingButton } from "./pending-button";

type ActiveTodayProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  carriedActions: CarriedAction[];
  profile: Profile;
  isClosing?: boolean;
};

export function ActiveToday({
  plan,
  actions,
  carriedActions,
  profile,
  isClosing = false,
}: ActiveTodayProps) {
  const remaining = actions.filter((action) => action.status === "active");
  const completed = actions
    .filter((action) => action.status === "completed")
    .sort((left, right) => {
      const leftTime = left.completed_at
        ? new Date(left.completed_at).getTime()
        : null;
      const rightTime = right.completed_at
        ? new Date(right.completed_at).getTime()
        : null;

      if (leftTime !== null && rightTime !== null) {
        return rightTime - leftTime;
      }

      if (leftTime !== null) {
        return -1;
      }

      if (rightTime !== null) {
        return 1;
      }

      return left.sort_order - right.sort_order;
    });
  const nextAction = remaining[0];
  const laterActions = remaining.slice(1);
  const total = remaining.length + completed.length;
  const carriedFromByActionId = matchCarriedActions(
    actions,
    carriedActions,
  );
  const previousLocalDate = addLocalDays(plan.local_date, -1);
  const carriedFromYesterdayCount = [
    ...carriedFromByActionId.values(),
  ].filter((localDate) => localDate === previousLocalDate).length;

  return (
    <section className="space-y-7">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Active Today
        </p>
        <h2 className="text-xl font-semibold leading-7 tracking-[-0.025em]">
          {plan.focus}
        </h2>
        {carriedFromYesterdayCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {carriedFromYesterdayCount}{" "}
            {carriedFromYesterdayCount === 1 ? "action" : "actions"} carried
            from yesterday
          </p>
        )}
        <p className="text-muted-foreground">
          {remaining.length} remaining · {total} total
        </p>
        {isClosing && (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
            Close Day is in progress. Review today here, or continue when
            you&apos;re ready.
          </p>
        )}
      </div>

      {nextAction ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Next action
          </h2>
          <ActionCard
            action={nextAction}
            timezone={profile.timezone}
            carriedFrom={carriedFromByActionId.get(nextAction.id)}
            prominent
            canToggle={!isClosing}
            canOpen={!isClosing}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 text-[var(--clarity-completed)]">
          <CheckCircle2 className="mb-4 size-7" />
          <h2 className="text-xl font-semibold">Everything is complete.</h2>
          <p className="mt-2 text-sm leading-6">
            Close the day when you&apos;re ready to record your progress.
          </p>
        </div>
      )}

      {laterActions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Remaining actions
          </h2>
          <div className="space-y-3">
            {laterActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                timezone={profile.timezone}
                carriedFrom={carriedFromByActionId.get(action.id)}
                canToggle={!isClosing}
                canOpen={!isClosing}
              />
            ))}
          </div>
        </div>
      )}

      {completed.length === 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Completed
          </h2>
          <div className="space-y-3">
            {completed.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                timezone={profile.timezone}
                carriedFrom={carriedFromByActionId.get(action.id)}
                canToggle={!isClosing}
                canOpen={!isClosing}
              />
            ))}
          </div>
        </div>
      )}

      {completed.length > 1 && (
        <details className="group rounded-2xl bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Completed ({completed.length})
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-3 pb-3">
            {completed.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                timezone={profile.timezone}
                carriedFrom={carriedFromByActionId.get(action.id)}
                canToggle={!isClosing}
                canOpen={!isClosing}
              />
            ))}
          </div>
        </details>
      )}

      {!isClosing && <AddActionForm planId={plan.id} />}

      <div className="border-t border-border pt-7">
        {isClosing ? (
          <Button
            asChild
            size="lg"
            className="h-12 w-full rounded-xl text-base"
          >
            <Link href="/today/close">
              Continue Close Day
              <ArrowRight />
            </Link>
          </Button>
        ) : (
          <form action={beginCloseDayAction}>
            <input type="hidden" name="planId" value={plan.id} />
            <PendingButton
              type="submit"
              variant="outline"
              size="lg"
              pendingLabel="Opening Close Day…"
              className="h-12 w-full rounded-xl text-base"
            >
              Close day
              <ArrowRight />
            </PendingButton>
          </form>
        )}
      </div>
    </section>
  );
}

function ActionCard({
  action,
  timezone,
  carriedFrom,
  prominent = false,
  canToggle = true,
  canOpen = true,
}: {
  action: DailyAction;
  timezone: string;
  carriedFrom?: string;
  prominent?: boolean;
  canToggle?: boolean;
  canOpen?: boolean;
}) {
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const completed = action.status === "completed";
  const scheduledTime = formatScheduledTime(action.scheduled_time, timezone);
  const completionTime = formatScheduledTime(
    action.completed_at,
    timezone,
  );

  return (
    <article
      className={`relative rounded-2xl border border-border p-4 shadow-sm sm:p-5 ${
        prominent
          ? "bg-secondary text-foreground"
          : canOpen
            ? "cursor-pointer bg-card transition-colors hover:bg-secondary"
            : "bg-card"
      }`}
    >
      {canOpen && (
        <Link
          href={`/today/actions/${action.id}`}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${action.title}`}
        />
      )}
      <div className="flex items-start gap-4">
        {canToggle ? (
          completed ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setConfirmingIncomplete(true)}
              className="relative z-10 mt-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-[var(--clarity-completed)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Mark ${action.title} incomplete`}
            >
              <Check className="size-4" />
            </Button>
          ) : (
            <form
              action={setActionCompletionAction}
              className="relative z-10"
            >
              <input type="hidden" name="actionId" value={action.id} />
              <input type="hidden" name="completed" value="true" />
              <PendingButton
                type="submit"
                size="icon"
                variant="outline"
                pendingLabel={<LoaderCircle className="animate-spin" />}
                className="mt-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-[var(--clarity-completed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Mark ${action.title} complete`}
              >
                <Circle className="size-4" />
              </PendingButton>
            </form>
          )
        ) : (
          <span
            className={`mt-0.5 flex size-8 items-center justify-center rounded-full border border-border ${
              completed
                ? "bg-secondary text-[var(--clarity-completed)]"
                : "bg-card text-muted-foreground"
            }`}
            aria-hidden="true"
          >
            {completed ? (
              <Check className="size-4" />
            ) : (
              <Circle className="size-4" />
            )}
          </span>
        )}
        <div className="pointer-events-none relative min-w-0 flex-1">
          <h3
            className={`font-semibold tracking-[-0.015em] ${
              completed ? "text-muted-foreground line-through" : ""
            }`}
          >
            {action.title}
          </h3>
          {carriedFrom && (
            <p className="mt-1 text-xs text-muted-foreground">
              Carried from {formatWeekday(carriedFrom)}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {completed ? (
              <>
                <span>
                  {completionTime
                    ? `Completed ${completionTime}`
                    : "Completed · Time not recorded"}
                </span>
                <span aria-hidden="true">·</span>
              </>
            ) : scheduledTime ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-[var(--clarity-completed)]">
                  <Clock3 className="size-3" />
                  {scheduledTime}
                </span>
                <span>·</span>
              </>
            ) : null}
            <span>{action.estimated_minutes} min</span>
          </div>
        </div>
      </div>
      {canToggle && completed && confirmingIncomplete && (
        <section className="relative z-10 mt-4 rounded-xl bg-card p-4">
          <p className="font-semibold">Mark this action incomplete?</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {completionTime
              ? `Its completion time of ${completionTime} will be removed.`
              : "Its recorded completion will be removed."}
          </p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              onClick={() => setConfirmingIncomplete(false)}
            >
              Keep completed
            </Button>
            <form action={markActionIncompleteAction}>
              <input type="hidden" name="actionId" value={action.id} />
              <PendingButton
                type="submit"
                pendingLabel="Marking incomplete…"
                className="h-10 w-full rounded-lg"
              >
                Mark incomplete
              </PendingButton>
            </form>
          </div>
        </section>
      )}
    </article>
  );
}

function matchCarriedActions(
  actions: DailyAction[],
  carriedActions: CarriedAction[],
) {
  const available = [...carriedActions];
  const matches = new Map<string, string>();

  for (const action of [...actions].sort(
    (left, right) => left.sort_order - right.sort_order,
  )) {
    const sourceIndex = available.findIndex(
      (source) =>
        source.title.trim().toLowerCase() ===
        action.title.trim().toLowerCase(),
    );

    if (sourceIndex === -1) {
      continue;
    }

    const [source] = available.splice(sourceIndex, 1);
    matches.set(action.id, source.sourceLocalDate);
  }

  return matches;
}
