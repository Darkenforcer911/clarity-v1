"use client";

import { ArrowLeft, MoveRight, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { approvePlanAction } from "@/app/(app)/today/actions";
import {
  removeProposedActionInlineAction,
  restoreProposedActionInlineAction,
  restoreRemovedProposedActionsAction,
} from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  formatScheduledTime,
  formatWeekday,
  getLocalDate,
  hasScheduledMinutePassed,
} from "@/lib/clarity/date-time";
import {
  canApproveProposedPlan,
  formatProposedPlanSummary,
  shouldClearOpenDayConfirmation,
} from "@/lib/clarity/proposed-plan-summary";
import { AddActionForm } from "./add-action-form";
import { PendingButton } from "./pending-button";
import { ProposedActionCard } from "./proposed-action-card";
import { DailyCommitments } from "./daily-commitments";
import {
  isCalendarEventReconciliationCandidate,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";
import { SoFarToday } from "./so-far-today";
import { SwipeToRemove } from "./swipe-to-remove";

type ProposedPlanProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  removedActionCount: number;
  profile: Profile;
  initialNow: string;
  commitments: CalendarCommitment[];
};

export function ProposedPlan({
  plan,
  actions,
  removedActionCount,
  profile,
  initialNow,
  commitments,
}: ProposedPlanProps) {
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [addActionOpen, setAddActionOpen] = useState(false);
  const [keepDayOpen, setKeepDayOpen] = useState(false);
  const [now, setNow] = useState(initialNow);
  const [swipedActionId, setSwipedActionId] = useState<string | null>(null);
  const [locallyRemovedActionIds, setLocallyRemovedActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [removingActionIds, setRemovingActionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pendingRemovalIds, setPendingRemovalIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [removalNoticeActionId, setRemovalNoticeActionId] = useState<
    string | null
  >(null);
  const [lastRemovedAction, setLastRemovedAction] = useState<DailyAction | null>(
    null,
  );
  const [optimisticallyRestoredAction, setOptimisticallyRestoredAction] =
    useState<DailyAction | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const actionListRef = useRef<HTMLDivElement>(null);
  const scrollTargetActionIdRef = useRef<string | null>(null);
  const dayName = formatWeekday(plan.local_date);
  const currentLocalDate = getLocalDate(
    profile.timezone,
    new Date(now),
  );
  const completedActions = actions.filter(
    (action) => action.status === "completed",
  );
  const serverRemainingActions = actions.filter(
    (action) => action.status === "proposed",
  );
  const remainingActionMap = new Map(
    serverRemainingActions.map((action) => [action.id, action]),
  );
  if (
    optimisticallyRestoredAction &&
    !remainingActionMap.has(optimisticallyRestoredAction.id)
  ) {
    remainingActionMap.set(
      optimisticallyRestoredAction.id,
      optimisticallyRestoredAction,
    );
  }
  const remainingActions = [...remainingActionMap.values()]
    .filter((action) => !locallyRemovedActionIds.has(action.id))
    .sort((left, right) => left.sort_order - right.sort_order);
  const passedActionIds = new Set(
    remainingActions
      .filter(
        (action) =>
          action.action_type === "fixed" &&
          hasScheduledMinutePassed(
            action.scheduled_time,
            plan.local_date,
            profile.timezone,
            new Date(now),
          ),
      )
      .map((action) => action.id),
  );
  const hasPassedActions = passedActionIds.size > 0;
  const reconciliationEvents = commitments.filter((commitment) =>
    isCalendarEventReconciliationCandidate(
      commitment,
      profile.timezone,
      new Date(now),
    ),
  );
  const reconciliationEventIds = new Set(
    reconciliationEvents.map((commitment) => commitment.id),
  );
  const upcomingCommitments = commitments.filter(
    (commitment) => !reconciliationEventIds.has(commitment.id),
  );
  const hasSoFarToday =
    completedActions.length > 0 || reconciliationEvents.length > 0;
  const totalMinutes = remainingActions.reduce(
    (total, action) => total + action.estimated_minutes,
    0,
  );
  const specificTimeCount = remainingActions.filter(
    (action) =>
      action.action_type === "fixed" &&
      action.scheduled_time !== null &&
      !passedActionIds.has(action.id),
  ).length;
  const planSummary = formatProposedPlanSummary(
    remainingActions.length,
    totalMinutes,
    specificTimeCount,
  );
  const hasRemainingActions = remainingActions.length > 0;
  const canRestoreRemovedActions =
    !hasRemainingActions &&
    (removedActionCount > 0 || locallyRemovedActionIds.size > 0);
  const previousRemainingCountRef = useRef(remainingActions.length);
  const router = useRouter();

  useEffect(() => {
    let timer = 0;

    const refreshNow = () => setNow(new Date().toISOString());
    const scheduleMinuteRefresh = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(() => {
        refreshNow();
        scheduleMinuteRefresh();
      }, delay);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshNow();
      }
    };

    scheduleMinuteRefresh();
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!swipedActionId) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setSwipedActionId(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>("[data-swipe-action-id]");
      if (swipedCard?.dataset.swipeActionId !== swipedActionId) {
        setSwipedActionId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [swipedActionId]);

  useEffect(() => {
    const previousCount = previousRemainingCountRef.current;
    previousRemainingCountRef.current = remainingActions.length;

    if (
      shouldClearOpenDayConfirmation(
        previousCount,
        remainingActions.length,
      )
    ) {
      const frame = window.requestAnimationFrame(() => {
        setKeepDayOpen(false);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [remainingActions.length]);

  const handleActionToggle = useCallback((actionId: string) => {
    setSwipedActionId(null);
    setExpandedActionId((currentActionId) => {
      const nextActionId = currentActionId === actionId ? null : actionId;
      scrollTargetActionIdRef.current = nextActionId;
      return nextActionId;
    });
  }, []);

  const handleActionCollapse = useCallback((actionId: string) => {
    setExpandedActionId((currentActionId) =>
      currentActionId === actionId ? null : currentActionId,
    );
  }, []);

  async function handleRestoreRemovedActions(formData: FormData) {
    await restoreRemovedProposedActionsAction(formData);
    setKeepDayOpen(false);
    setExpandedActionId(null);
    setSwipedActionId(null);
    setLocallyRemovedActionIds(new Set());
    setRemovalNoticeActionId(null);
    setLastRemovedAction(null);
    setOptimisticallyRestoredAction(null);
  }

  async function removeAction(actionId: string) {
    const action = remainingActions.find((candidate) => candidate.id === actionId);
    if (!action) return;

    setRemovalError(null);
    setPendingRemovalIds((current) => new Set(current).add(actionId));
    const result = await removeProposedActionInlineAction(actionId);
    setPendingRemovalIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });

    if (!result.success) {
      setSwipedActionId(null);
      setRemovalError(result.error ?? "Couldn’t remove the action. Try again.");
      return;
    }

    setExpandedActionId((current) => (current === actionId ? null : current));
    setRemovingActionIds((current) => new Set(current).add(actionId));
    setSwipedActionId(null);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 190;
    window.setTimeout(() => {
      setLocallyRemovedActionIds((current) => new Set(current).add(actionId));
      setRemovingActionIds((current) => {
        const next = new Set(current);
        next.delete(actionId);
        return next;
      });
      setLastRemovedAction(action);
      setOptimisticallyRestoredAction(null);
      setRemovalNoticeActionId(actionId);
      setKeepDayOpen(false);
    }, delay);
  }

  async function undoRemoval() {
    if (!removalNoticeActionId || undoPending) return;

    const actionId = removalNoticeActionId;
    setUndoPending(true);
    setRemovalError(null);
    const result = await restoreProposedActionInlineAction(actionId);
    setUndoPending(false);

    if (!result.success) {
      setRemovalError(result.error ?? "Couldn’t restore the action. Try again.");
      return;
    }

    setLocallyRemovedActionIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });
    if (lastRemovedAction?.id === actionId) {
      setOptimisticallyRestoredAction(lastRemovedAction);
    }
    setRemovalNoticeActionId(null);
    setLastRemovedAction(null);
    setExpandedActionId(null);
    router.refresh();
  }

  useEffect(() => {
    if (
      !expandedActionId ||
      scrollTargetActionIdRef.current !== expandedActionId
    ) {
      return;
    }

    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        const card = actionListRef.current?.querySelector<HTMLElement>(
          `[data-proposed-action-id="${expandedActionId}"]`,
        );
        const header = card?.querySelector<HTMLElement>(
          "[data-proposed-action-header]",
        );

        if (!header) {
          return;
        }

        const headerBounds = header.getBoundingClientRect();
        const navigation = document.querySelector<HTMLElement>(
          'nav[aria-label="Primary"]',
        );
        const viewportTop = 12;
        const viewportBottom = Math.min(
          window.innerHeight,
          navigation?.getBoundingClientRect().top ?? window.innerHeight,
        ) - 12;
        let adjustment = 0;

        if (headerBounds.top < viewportTop) {
          adjustment = headerBounds.top - viewportTop;
        } else if (headerBounds.bottom > viewportBottom) {
          adjustment = headerBounds.bottom - viewportBottom;
        }

        if (Math.abs(adjustment) > 1) {
          const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;

          window.scrollBy({
            top: adjustment,
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }

        scrollTargetActionIdRef.current = null;
      });
    }, 210);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [expandedActionId]);

  return (
    <section className="w-full min-w-0 max-w-full space-y-8">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">
            {hasSoFarToday ? `Plan the rest of ${dayName}` : `Plan ${dayName}`}
          </h1>
          <p className="max-w-xl leading-7 text-muted-foreground">
            {hasSoFarToday
              ? "Record what has already happened, then review what remains."
              : "Review and adjust today's actions before you begin."}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{planSummary}</p>

        {removalNoticeActionId && (
          <div
            role="status"
            className="inline-flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-secondary px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-foreground">
              Removed from {dayName}
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
              <span role="alert" className="basis-full pb-1 text-xs text-destructive">
                {removalError}
              </span>
            )}
          </div>
        )}
        {removalError && !removalNoticeActionId && (
          <p role="alert" className="text-sm text-destructive">
            {removalError}
          </p>
        )}

        <DailyCommitments
          heading="Fixed today"
          commitments={upcomingCommitments}
          timezone={profile.timezone}
          now={new Date(now)}
        />

        <SoFarToday
          planId={plan.id}
          planDate={plan.local_date}
          timezone={profile.timezone}
          completedActions={completedActions}
          calendarEvents={reconciliationEvents}
        />

        <div ref={actionListRef} className="min-w-0 space-y-4">
          {remainingActions.map((action) => {
            return (
              <div key={action.id} data-proposed-action-id={action.id}>
                <SwipeToRemove
                  itemId={action.id}
                  itemTitle={action.title}
                  open={swipedActionId === action.id}
                  onOpenChange={(open) =>
                    setSwipedActionId(open ? action.id : null)
                  }
                  onRemove={() => removeAction(action.id)}
                  removalPending={pendingRemovalIds.has(action.id)}
                  removing={removingActionIds.has(action.id)}
                  enabled
                  accessibilityContext="from the proposed plan"
                >
                  <ProposedActionCard
                    action={action}
                    scheduledTime={formatScheduledTime(
                      action.scheduled_time,
                      profile.timezone,
                    )}
                    scheduledTimeInput={formatTimeInput(
                      action.scheduled_time,
                      profile.timezone,
                    )}
                    timePassed={passedActionIds.has(action.id)}
                    expanded={expandedActionId === action.id}
                    onToggle={handleActionToggle}
                    onCollapse={handleActionCollapse}
                    onRemove={removeAction}
                    planLocalDate={plan.local_date}
                    currentLocalDate={currentLocalDate}
                  />
                </SwipeToRemove>
              </div>
            );
          })}
        </div>

        {!hasRemainingActions && (
          <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                No actions planned for {dayName}.
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Add something important, or start the day without planned
                actions.
              </p>
            </div>

            {!addActionOpen && (
              <div className="grid gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddActionOpen(true)}
                  className="h-11 rounded-xl"
                >
                  <Plus />
                  Add action
                </Button>
                {canRestoreRemovedActions && (
                  <form action={handleRestoreRemovedActions}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <PendingButton
                      type="submit"
                      variant="outline"
                      pendingLabel="Restoring…"
                      className="h-11 w-full rounded-xl"
                    >
                      <RotateCcw />
                      Restore removed actions
                    </PendingButton>
                  </form>
                )}
                {!keepDayOpen && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setKeepDayOpen(true)}
                    className="h-11 rounded-xl text-muted-foreground"
                  >
                    Skip planning today
                  </Button>
                )}
              </div>
            )}

            {keepDayOpen && (
              <p
                role="status"
                className="text-sm leading-6 text-[var(--clarity-completed)]"
              >
                {dayName} will begin with no planned actions. You can add
                actions anytime.
              </p>
            )}
          </div>
        )}

        <AddActionForm
          planId={plan.id}
          proposed
          open={addActionOpen}
          onOpenChange={setAddActionOpen}
          hideTrigger={!hasRemainingActions}
          onActionSaved={() => setKeepDayOpen(false)}
        />
      </div>

      <div className="w-full min-w-0 max-w-full rounded-2xl bg-background py-2">
        {hasPassedActions && (
          <p className="mb-3 text-center text-sm leading-6 text-muted-foreground">
            Resolve passed action times before beginning.
          </p>
        )}
        <form action={approvePlanAction}>
          <input type="hidden" name="planId" value={plan.id} />
          <input
            type="hidden"
            name="allowEmptyPlan"
            value={String(!hasRemainingActions && keepDayOpen)}
          />
          <PendingButton
            type="submit"
            size="lg"
            disabled={
              hasPassedActions ||
              !canApproveProposedPlan(
                remainingActions.length,
                keepDayOpen,
              )
            }
            pendingLabel="Approving plan…"
            className="h-12 w-full rounded-xl text-base"
          >
            {!hasRemainingActions && keepDayOpen
              ? `Start ${dayName}`
              : "Approve plan"}
            <MoveRight />
          </PendingButton>
        </form>
      </div>
    </section>
  );
}

function formatTimeInput(value: string | null, timezone: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
