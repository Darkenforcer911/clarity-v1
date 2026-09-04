"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

import { skipCalendarEventOccurrenceAction } from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";

import {
  formatCalendarOutcomeStatus,
  formatCommitmentRecurrence,
  getCommitmentMeta,
  getCommitmentTimingState,
  sortCalendarCommitments,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { orderLaterTodayItems } from "@/lib/clarity/today-display-order";
import { SwipeToRemove } from "./swipe-to-remove";
import { CalendarCommitmentDeleteControl } from "./calendar-commitment-delete-control";
import { TimedDayItemSummary } from "./timed-day-item-summary";

export function DailyCommitments({
  heading,
  commitments,
  actions = [],
  renderAction,
  needsOutcome = false,
  timezone,
  now,
}: {
  heading: string;
  commitments: CalendarCommitment[];
  actions?: DailyAction[];
  renderAction?: (action: DailyAction) => ReactNode;
  needsOutcome?: boolean;
  timezone: string;
  now: Date;
}) {
  const items = orderLaterTodayItems({
    actions,
    commitments: sortCalendarCommitments(commitments),
    timezone,
  });

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {heading}
      </h2>
      <div className="space-y-2">
        {items.map((item) =>
          item.kind === "action" ? (
            <Fragment key={`action-${item.value.id}`}>
              {renderAction?.(item.value)}
            </Fragment>
          ) : (
            <DailyCommitmentCard
              key={`commitment-${item.value.id}`}
              commitment={item.value}
              timezone={timezone}
              now={now}
              needsOutcome={needsOutcome}
            />
          ),
        )}
      </div>
    </section>
  );
}

export function DailyCommitmentCard({
  commitment,
  timezone,
  now,
  needsOutcome = false,
}: {
  commitment: CalendarCommitment;
  timezone: string;
  now: Date;
  needsOutcome?: boolean;
}) {
  const router = useRouter();
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [removalPending, setRemovalPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const timing = getCommitmentTimingState(commitment, timezone, now);
  const recurrence = formatCommitmentRecurrence(commitment);
  const recurringEvent =
    commitment.commitment_type === "event" && commitment.recurrence !== "none";
  const removable =
    commitment.status === "scheduled" &&
    !commitment.reconciliation_outcome &&
    (commitment.recurrence === "none" || recurringEvent);
  const status = commitment.reconciliation_outcome
    ? formatCalendarOutcomeStatus(commitment, timezone)
    : needsOutcome && (timing === "time_passed" || timing === "overdue")
      ? "Needs outcome"
      : timing === "time_passed"
        ? "Time passed"
        : timing === "overdue"
          ? "Overdue"
        : timing !== "scheduled"
          ? timing[0].toUpperCase() + timing.slice(1)
          : null;

  const surface = (
    <Link
      href={`/calendar?date=${commitment.occurrence_date}&commitment=${commitment.id}`}
      className="flex min-h-14 min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TimedDayItemSummary
        title={commitment.title}
        meta={[getCommitmentMeta(commitment), recurrence]
          .filter(Boolean)
          .join(" · ")}
        status={status}
      />
    </Link>
  );

  if (!removable) return surface;

  async function removeCommitment() {
    if (removalPending) return;

    if (!recurringEvent) {
      setRemovalError(null);
      setDeleteConfirming(true);
      setSwipeOpen(false);
      return;
    }

    setRemovalPending(true);
    setRemovalError(null);
    const formData = new FormData();
    formData.set("commitmentId", commitment.id);
    formData.set("occurrenceDate", commitment.occurrence_date);

    const result = await skipCalendarEventOccurrenceAction(
      initialCalendarActionState,
      formData,
    );

    if (!result.saved) {
      setRemovalError(
        result.error ?? "Couldn’t remove this item from today. Try again.",
      );
      setRemovalPending(false);
      setSwipeOpen(false);
      return;
    }

    setRemoving(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 190;
    window.setTimeout(() => {
      setSwipeOpen(false);
      router.refresh();
    }, delay);
  }

  return (
    <SwipeToRemove
      itemId={commitment.id}
      itemTitle={commitment.title}
      open={swipeOpen}
      onOpenChange={setSwipeOpen}
      onRemove={removeCommitment}
      removalPending={removalPending}
      removing={removing}
      enabled
      accessibilityContext="from today"
      actionLabel={recurringEvent ? "Skip today" : "Remove today"}
      pendingLabel={recurringEvent ? "Skipping…" : "Removing…"}
    >
      <div className="min-w-0">
        {surface}
        {deleteConfirming && (
          <div className="rounded-b-2xl border-x border-b border-border bg-card px-4 pb-4 pt-2">
            <CalendarCommitmentDeleteControl
              commitment={commitment}
              confirming
              onConfirmingChange={setDeleteConfirming}
              onSaved={() => router.refresh()}
              showTrigger={false}
            />
          </div>
        )}
        {removalError && (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            {removalError}
          </p>
        )}
      </div>
    </SwipeToRemove>
  );
}
