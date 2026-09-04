"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useActionState,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  cancelCalendarCommitmentAction,
  correctCalendarEventOccurrenceOutcomeAction,
  skipCalendarEventOccurrenceAction,
} from "@/app/(app)/calendar/actions";
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
import { Button } from "@/components/ui/button";
import { CalendarOccurrenceOutcomeControl } from "./calendar-occurrence-outcome-control";
import { PendingButton } from "./pending-button";
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
  const [expanded, setExpanded] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [removalPending, setRemovalPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const timing = getCommitmentTimingState(commitment, timezone, now);
  const recurrence = formatCommitmentRecurrence(commitment);
  const recurringEvent =
    commitment.commitment_type === "event" && commitment.recurrence !== "none";
  const eventOccurrence = commitment.commitment_type === "event";
  const recordedOutcome = Boolean(commitment.reconciliation_outcome);
  const [completionState, completionAction] = useActionState(
    correctCalendarEventOccurrenceOutcomeAction,
    initialCalendarActionState,
  );
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

  useEffect(() => {
    if (!completionState.saved) return;
    router.refresh();
  }, [completionState.saved, completionState.version, router]);

  const handleOccurrenceSaved = useCallback(() => {
    setExpanded(false);
    router.refresh();
  }, [router]);

  const surface = (
    <button
      type="button"
      onClick={() => setExpanded((value) => !value)}
      aria-expanded={expanded}
      className="flex min-h-14 w-full min-w-0 items-start gap-3 bg-card p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <TimedDayItemSummary
        title={commitment.title}
        meta={[getCommitmentMeta(commitment), recurrence]
          .filter(Boolean)
          .join(" · ")}
        status={status}
        disclosure
        expanded={expanded}
      />
    </button>
  );

  if (!eventOccurrence) {
    return (
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
  }

  async function skipToday() {
    if (removalPending) return;

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

  async function removeCommitment() {
    if (recurringEvent) {
      await skipToday();
      return;
    }

    setRemovalError(null);
    setDeleteConfirming(true);
    setSwipeOpen(false);
  }

  const occurrenceWorkspace = expanded ? (
    <div
      data-today-calendar-occurrence-workspace
      className="space-y-3 border-t border-border bg-card px-4 pb-4 pt-3"
    >
      {recordedOutcome ? (
        <CalendarOccurrenceOutcomeControl
          commitment={commitment}
          timezone={timezone}
          onSaved={handleOccurrenceSaved}
          currentDay
        />
      ) : (
        <>
          <form action={completionAction}>
            <input type="hidden" name="commitmentId" value={commitment.id} />
            <input
              type="hidden"
              name="occurrenceDate"
              value={commitment.occurrence_date}
            />
            <input type="hidden" name="outcome" value="attended" />
            <input type="hidden" name="completedTime" value="" />
            <input type="hidden" name="note" value="" />
            <PendingButton
              type="submit"
              pendingLabel="Completing…"
              className="h-11 w-full rounded-xl"
            >
              Done
            </PendingButton>
          </form>
          <Button
            type="button"
            variant="outline"
            onClick={skipToday}
            disabled={removalPending}
            className="h-11 w-full rounded-xl"
          >
            {removalPending ? "Skipping…" : "Skip today"}
          </Button>
          {completionState.error && (
            <p role="alert" className="text-xs text-destructive">
              {completionState.error}
            </p>
          )}
        </>
      )}
      <Button asChild variant="ghost" className="h-11 w-full text-muted-foreground">
        <Link
          href={`/calendar?date=${commitment.occurrence_date}&commitment=${commitment.id}`}
        >
          {recurringEvent ? "Edit recurring commitment" : "Edit commitment"}
        </Link>
      </Button>
      {recurringEvent && (
        <TodayCancelRecurringSeriesControl
          commitment={commitment}
          onSaved={handleOccurrenceSaved}
        />
      )}
    </div>
  ) : null;

  if (!removable) {
    return (
      <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        {surface}
        {occurrenceWorkspace}
      </article>
    );
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
      <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
        {surface}
        {occurrenceWorkspace}
        {deleteConfirming && (
          <div className="border-t border-border bg-card px-4 pb-4 pt-2">
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
      </article>
    </SwipeToRemove>
  );
}

function TodayCancelRecurringSeriesControl({
  commitment,
  onSaved,
}: {
  commitment: CalendarCommitment;
  onSaved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(
    cancelCalendarCommitmentAction,
    initialCalendarActionState,
  );

  useEffect(() => {
    if (state.saved) onSaved();
  }, [onSaved, state.saved, state.version]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="h-11 w-full text-muted-foreground"
      >
        Cancel recurring series
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3">
      <p className="text-sm font-medium">Cancel this recurring series?</p>
      <form action={action} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
        <PendingButton type="submit" variant="destructive" pendingLabel="Working…">
          Cancel
        </PendingButton>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
