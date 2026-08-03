"use client";

import { ArrowLeft, MoveRight, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { approvePlanAction } from "@/app/(app)/today/actions";
import { restoreRemovedProposedActionsAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type {
  DailyAction,
  DailyPlan,
  Profile,
} from "@/lib/clarity/daily-loop-queries";
import {
  formatScheduledTime,
  formatWeekday,
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

type ProposedPlanProps = {
  plan: DailyPlan;
  actions: DailyAction[];
  removedActionCount: number;
  profile: Profile;
  initialNow: string;
};

export function ProposedPlan({
  plan,
  actions,
  removedActionCount,
  profile,
  initialNow,
}: ProposedPlanProps) {
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [addActionOpen, setAddActionOpen] = useState(false);
  const [keepDayOpen, setKeepDayOpen] = useState(false);
  const [now, setNow] = useState(initialNow);
  const actionListRef = useRef<HTMLDivElement>(null);
  const scrollTargetActionIdRef = useRef<string | null>(null);
  const dayName = formatWeekday(plan.local_date);
  const remainingActions = actions.filter(
    (action) => action.status === "proposed",
  );
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
    !hasRemainingActions && removedActionCount > 0;
  const previousRemainingCountRef = useRef(remainingActions.length);

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
            Plan {dayName}
          </h1>
          <p className="max-w-xl leading-7 text-muted-foreground">
            Review and adjust today&apos;s actions before you begin.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{planSummary}</p>

        <div ref={actionListRef} className="min-w-0 space-y-4">
          {remainingActions.map((action) => {
            return (
              <div key={action.id} data-proposed-action-id={action.id}>
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
                />
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
