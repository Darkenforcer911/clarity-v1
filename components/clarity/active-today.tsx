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
import { useRouter } from "next/navigation";
import {
  startTransition,
  useEffect,
  useOptimistic,
  useState,
} from "react";

import {
  beginCloseDayAction,
  setActionCompletionAction,
} from "@/app/(app)/today/actions";
import {
  removeActionFromTodayInlineAction,
  restoreActionToTodayAction,
} from "@/app/(app)/today/action-workspace-actions";
import type {
  CarriedAction,
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  getActiveActionTiming,
  selectNextActiveAction,
  type ActiveActionTiming,
} from "@/lib/clarity/active-today-scheduling";
import {
  addLocalDays,
  formatScheduledTime,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { formatDuration } from "@/lib/clarity/proposed-plan-summary";
import { Button } from "@/components/ui/button";
import { AddActionForm } from "./add-action-form";
import { PendingButton } from "./pending-button";
import { DailyCommitments } from "./daily-commitments";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import {
  getLaterCommitmentsHeading,
  partitionTodayCommitmentsForAttention,
} from "@/lib/clarity/today-commitment-priority";
import { SwipeToRemove } from "./swipe-to-remove";

type ActiveTodayProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  carriedActions: CarriedAction[];
  profile: Profile;
  isClosing?: boolean;
  initialRemovedActionId?: string | null;
  initialNow: string;
  commitments: CalendarCommitment[];
};

export function ActiveToday({
  plan,
  actions,
  carriedActions,
  profile,
  isClosing = false,
  initialRemovedActionId = null,
  initialNow,
  commitments,
}: ActiveTodayProps) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const [optimisticActions, updateOptimisticAction] = useOptimistic(
    actions,
    (
      current,
      update: {
        actionId: string;
        completed: boolean;
        completedAt: string;
      },
    ) =>
      current.map((action) =>
        action.id === update.actionId
          ? {
              ...action,
              status: update.completed ? "completed" : "active",
              completed_at: update.completed
                ? update.completedAt
                : null,
              completion_recorded_at: update.completed
                ? update.completedAt
                : null,
              completion_time_unknown: false,
            }
          : action,
      ),
  );
  const [pendingActionIds, setPendingActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [completionError, setCompletionError] = useState<string | null>(
    null,
  );
  const [removedActionIds, setRemovedActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [removingActionIds, setRemovingActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pendingRemovalIds, setPendingRemovalIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [swipedActionId, setSwipedActionId] = useState<string | null>(null);
  const [removalNoticeActionId, setRemovalNoticeActionId] = useState<
    string | null
  >(initialRemovedActionId);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const visibleActions = optimisticActions.filter(
    (action) => !removedActionIds.has(action.id),
  );
  const remaining = visibleActions.filter(
    (action) => action.status === "active",
  );
  const completed = visibleActions
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
  const nextAction = selectNextActiveAction(
    remaining,
    plan.local_date,
    profile.timezone,
    now,
  );
  const {
    approaching: approachingCommitments,
    later: laterCommitments,
  } = partitionTodayCommitmentsForAttention({
    commitments,
    localDate: plan.local_date,
    timezone: profile.timezone,
    now,
    nextActionDurationMinutes: nextAction?.estimated_minutes ?? null,
  });
  const laterActions = remaining.filter(
    (action) => action.id !== nextAction?.id,
  );
  const timingByActionId = new Map(
    remaining.map((action) => [
      action.id,
      getActiveActionTiming(
        action,
        plan.local_date,
        profile.timezone,
        now,
      ),
    ]),
  );
  const router = useRouter();
  const total = remaining.length + completed.length;
  const carriedFromByActionId = matchCarriedActions(
    actions,
    carriedActions,
  );
  const previousLocalDate = addLocalDays(plan.local_date, -1);
  const carriedFromYesterdayCount = [
    ...carriedFromByActionId.values(),
  ].filter((localDate) => localDate === previousLocalDate).length;

  useEffect(() => {
    let minuteTimeout: number | undefined;

    const refreshNow = () => setNow(new Date());
    const scheduleMinuteRefresh = () => {
      refreshNow();
      const delay = 60_000 - (Date.now() % 60_000) + 25;
      minuteTimeout = window.setTimeout(scheduleMinuteRefresh, delay);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };

    scheduleMinuteRefresh();
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (minuteTimeout !== undefined) {
        window.clearTimeout(minuteTimeout);
      }
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
    };
  }, []);

  useEffect(() => {
    if (!swipedActionId) {
      return;
    }

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        setSwipedActionId(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>(
        "[data-swipe-action-id]",
      );

      if (swipedCard?.dataset.swipeActionId !== swipedActionId) {
        setSwipedActionId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [swipedActionId]);

  useEffect(() => {
    if (!nextAction) {
      return;
    }

    router.prefetch(`/today/actions/${nextAction.id}`);
  }, [nextAction, router]);

  function updateCompletion(actionId: string, completed: boolean) {
    const completedAt = new Date().toISOString();
    const formData = new FormData();
    formData.set("actionId", actionId);
    formData.set("completed", String(completed));
    setCompletionError(null);
    setSwipedActionId(null);
    setPendingActionIds((current) => new Set(current).add(actionId));

    startTransition(async () => {
      updateOptimisticAction({ actionId, completed, completedAt });

      try {
        await setActionCompletionAction(formData);
      } catch {
        setCompletionError(
          completed
            ? "Couldn’t complete the action. Try again."
            : "Couldn’t mark the action incomplete. Try again.",
        );
      } finally {
        setPendingActionIds((current) => {
          const next = new Set(current);
          next.delete(actionId);
          return next;
        });
      }
    });
  }

  async function removeAction(actionId: string) {
    setRemovalError(null);
    setPendingRemovalIds((current) => new Set(current).add(actionId));

    const result = await removeActionFromTodayInlineAction(actionId);

    setPendingRemovalIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });

    if (!result.success) {
      setSwipedActionId(null);
      setRemovalError(
        result.error ?? "Couldn’t remove the action from today. Try again.",
      );
      return;
    }

    setRemovingActionIds((current) => new Set(current).add(actionId));
    setSwipedActionId(null);
    const removalDelay = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? 0
      : 190;
    window.setTimeout(() => {
      setRemovedActionIds((current) => new Set(current).add(actionId));
      setRemovingActionIds((current) => {
        const next = new Set(current);
        next.delete(actionId);
        return next;
      });
      setRemovalNoticeActionId(actionId);
      router.refresh();
    }, removalDelay);
  }

  async function undoRemoval() {
    if (!removalNoticeActionId || undoPending) {
      return;
    }

    setUndoPending(true);
    setRemovalError(null);
    const actionId = removalNoticeActionId;
    const result = await restoreActionToTodayAction(actionId);
    setUndoPending(false);

    if (!result.success) {
      setRemovalError(result.error ?? "Couldn’t restore the action. Try again.");
      return;
    }

    setRemovedActionIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });
    setRemovalNoticeActionId(null);
    router.replace("/today/active", { scroll: false });
    router.refresh();
  }

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
        {completionError && (
          <p role="alert" className="text-sm text-destructive">
            {completionError}
          </p>
        )}
        {removalError && !removalNoticeActionId && (
          <p role="alert" className="text-sm text-destructive">
            {removalError}
          </p>
        )}
        {removalNoticeActionId && (
          <div
            role="status"
            className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-secondary px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-foreground">
              Action removed
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={undoPending}
              onClick={undoRemoval}
              className="h-9 px-2 text-[var(--clarity-completed)]"
            >
              {undoPending ? "Restoring…" : "Undo"}
            </Button>
            {removalError && (
              <span
                role="alert"
                className="basis-full pb-1 text-xs text-destructive"
              >
                {removalError}
              </span>
            )}
          </div>
        )}
        {isClosing && (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
            Close Day is in progress. Review today here, or continue when
            you&apos;re ready.
          </p>
        )}
      </div>

      <DailyCommitments
        heading="Coming up"
        commitments={approachingCommitments}
        timezone={profile.timezone}
        now={now}
      />

      {nextAction ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Next action
          </h2>
          <SwipeableActionCard
            action={nextAction}
            timing={timingByActionId.get(nextAction.id)}
            timezone={profile.timezone}
            carriedFrom={carriedFromByActionId.get(nextAction.id)}
            prominent
            canToggle={!isClosing}
            canOpen={!isClosing}
            pending={pendingActionIds.has(nextAction.id)}
            onCompletionChange={updateCompletion}
            open={swipedActionId === nextAction.id}
            onOpenChange={(open) =>
              setSwipedActionId(open ? nextAction.id : null)
            }
            onRemove={removeAction}
            removalPending={pendingRemovalIds.has(nextAction.id)}
            removing={removingActionIds.has(nextAction.id)}
            enabled={!isClosing}
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

      <DailyCommitments
        heading={getLaterCommitmentsHeading({
          commitments: laterCommitments,
          localDate: plan.local_date,
          timezone: profile.timezone,
          now,
        })}
        commitments={laterCommitments}
        timezone={profile.timezone}
        now={now}
      />

      {laterActions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Remaining actions
          </h2>
          <div className="space-y-3">
            {laterActions.map((action) => (
              <SwipeableActionCard
                key={action.id}
                action={action}
                timing={timingByActionId.get(action.id)}
                timezone={profile.timezone}
                carriedFrom={carriedFromByActionId.get(action.id)}
                canToggle={!isClosing}
                canOpen={!isClosing}
                pending={pendingActionIds.has(action.id)}
                onCompletionChange={updateCompletion}
                open={swipedActionId === action.id}
                onOpenChange={(open) =>
                  setSwipedActionId(open ? action.id : null)
                }
                onRemove={removeAction}
                removalPending={pendingRemovalIds.has(action.id)}
                removing={removingActionIds.has(action.id)}
                enabled={!isClosing}
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
                pending={pendingActionIds.has(action.id)}
                onCompletionChange={updateCompletion}
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
                pending={pendingActionIds.has(action.id)}
                onCompletionChange={updateCompletion}
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
              pendingLabel="Preparing recap..."
              className="h-12 w-full rounded-xl text-base"
            >
              Close {formatWeekday(plan.local_date)}
              <ArrowRight />
            </PendingButton>
          </form>
        )}
      </div>
    </section>
  );
}

function SwipeableActionCard({
  action,
  open,
  onOpenChange,
  onRemove,
  removalPending,
  removing,
  enabled,
  ...cardProps
}: Omit<React.ComponentProps<typeof ActionCard>, "action"> & {
  action: DailyAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (actionId: string) => void;
  removalPending: boolean;
  removing: boolean;
  enabled: boolean;
}) {
  return (
    <SwipeToRemove
      itemId={action.id}
      itemTitle={action.title}
      open={open}
      onOpenChange={onOpenChange}
      onRemove={() => onRemove(action.id)}
      removalPending={removalPending}
      removing={removing}
      enabled={enabled}
      accessibilityContext="from today"
    >
      <ActionCard action={action} {...cardProps} />
    </SwipeToRemove>
  );
}

function ActionCard({
  action,
  timing,
  timezone,
  carriedFrom,
  prominent = false,
  canToggle = true,
  canOpen = true,
  pending = false,
  onCompletionChange,
}: {
  action: DailyAction;
  timing?: ActiveActionTiming;
  timezone: string;
  carriedFrom?: string;
  prominent?: boolean;
  canToggle?: boolean;
  canOpen?: boolean;
  pending?: boolean;
  onCompletionChange: (actionId: string, completed: boolean) => void;
}) {
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const completed = action.status === "completed";
  const completionCanToggle = canToggle && !action.completion_evidence_only;
  const actionCanOpen = canOpen && !action.completion_evidence_only;
  const scheduledTime = formatScheduledTime(action.scheduled_time, timezone);
  const completionTime = formatScheduledTime(
    action.completed_at,
    timezone,
  );
  const scheduledStatus =
    scheduledTime && timing?.kind === "overdue"
      ? `${scheduledTime} · ${formatDuration(
          timing.minutesFromNow,
        )} overdue`
      : scheduledTime && timing?.kind === "now"
        ? `${scheduledTime} · Now`
        : scheduledTime;

  return (
    <article
      className={`relative rounded-2xl border p-4 shadow-sm sm:p-5 ${
        timing?.kind === "overdue"
          ? "border-primary/70"
          : "border-border"
      } ${
        prominent
          ? "bg-secondary text-foreground"
          : actionCanOpen
            ? "cursor-pointer bg-card transition-colors hover:bg-secondary"
            : "bg-card"
      }`}
    >
      {actionCanOpen && (
        <Link
          href={`/today/actions/${action.id}`}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${action.title}`}
        />
      )}
      <div className="flex items-start gap-4">
        {completionCanToggle ? (
          completed ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmingIncomplete(true)}
              className="relative z-10 mt-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-[var(--clarity-completed)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Mark ${action.title} incomplete`}
            >
              <Check className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={pending}
              onClick={() => onCompletionChange(action.id, true)}
              className="relative z-10 mt-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-[var(--clarity-completed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Mark ${action.title} complete`}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Circle className="size-4" />
              )}
            </Button>
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
            ) : scheduledStatus ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-[var(--clarity-completed)]">
                  <Clock3 className="size-3" />
                  {scheduledStatus}
                </span>
                <span>·</span>
              </>
            ) : null}
            {!action.completion_evidence_only && (
              <span>{formatDuration(action.estimated_minutes)}</span>
            )}
          </div>
        </div>
      </div>
      {completionCanToggle && completed && confirmingIncomplete && (
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
            <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmingIncomplete(false);
                  onCompletionChange(action.id, false);
                }}
                className="h-10 w-full rounded-lg"
              >
                {pending ? "Marking incomplete…" : "Mark incomplete"}
              </Button>
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
