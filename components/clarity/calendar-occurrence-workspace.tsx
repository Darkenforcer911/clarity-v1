"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";

import {
  cancelCalendarCommitmentAction,
  correctCalendarEventOccurrenceOutcomeAction,
  skipCalendarEventOccurrenceAction,
} from "@/app/(app)/calendar/actions";
import { Button } from "@/components/ui/button";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import { buildCalendarCommitmentClarityHref } from "@/lib/clarity/clarity-action-context";
import { getLocalTime } from "@/lib/clarity/date-time";
import { CalendarCommitmentDeleteControl } from "./calendar-commitment-delete-control";
import { CalendarOccurrenceOutcomeControl } from "./calendar-occurrence-outcome-control";
import {
  DayItemMoreDisclosure,
  DayItemSecondaryActions,
  DayItemWorkspaceShell,
} from "./day-item-workspace-shell";
import { PendingButton } from "./pending-button";

export function CalendarOccurrenceWorkspace({
  commitment,
  today,
  timezone,
  now,
  readOnly = false,
  contained = true,
  skipReturnDate,
  onEdit,
  onSaved,
  onRemoved,
}: {
  commitment: CalendarCommitment;
  today: string;
  timezone: string;
  now: Date;
  readOnly?: boolean;
  contained?: boolean;
  skipReturnDate?: string;
  onEdit: () => void;
  onSaved: () => void;
  onRemoved?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [skipConfirming, setSkipConfirming] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [completionState, completionAction] = useActionState(
    correctCalendarEventOccurrenceOutcomeAction,
    initialCalendarActionState,
  );
  const recurringEvent =
    commitment.commitment_type === "event" && commitment.recurrence !== "none";
  const currentDate = commitment.occurrence_date === today;
  const currentEvent =
    commitment.commitment_type === "event" &&
    currentDate;
  const recordedOutcome = Boolean(commitment.reconciliation_outcome);
  const editable = !readOnly && commitment.status === "scheduled";
  const canSkipOccurrence =
    editable && recurringEvent && !recordedOutcome &&
    commitment.occurrence_date >= today;
  useEffect(() => {
    if (completionState.saved) onSaved();
  }, [completionState.saved, completionState.version, onSaved]);

  const primary = currentEvent ? (
    recordedOutcome ? (
      <CalendarOccurrenceOutcomeControl
        commitment={commitment}
        timezone={timezone}
        onSaved={onSaved}
        currentDay
      />
    ) : (
      <form action={completionAction}>
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <input
          type="hidden"
          name="occurrenceDate"
          value={commitment.occurrence_date}
        />
        <input type="hidden" name="outcome" value="attended" />
        <input
          type="hidden"
          name="completedTime"
          value={getLocalTime(timezone, now)}
        />
        <input type="hidden" name="note" value="" />
        <PendingButton
          type="submit"
          pendingLabel="Completing…"
          className="h-11 w-full rounded-xl"
        >
          Done
        </PendingButton>
        {completionState.error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {completionState.error}
          </p>
        )}
      </form>
    )
  ) : readOnly && commitment.commitment_type === "event" ? (
    <CalendarOccurrenceOutcomeControl
      commitment={commitment}
      timezone={timezone}
      onSaved={onSaved}
      currentDay={false}
    />
  ) : undefined;

  return (
    <div
      data-calendar-occurrence-workspace
      className={contained ? "space-y-3 bg-card px-4 pb-4 pt-3" : "space-y-3"}
    >
      <DayItemWorkspaceShell
        primary={primary}
        clarityHref={buildCalendarCommitmentClarityHref(
          commitment.id,
          commitment.occurrence_date,
        )}
        secondary={
          <DayItemSecondaryActions>
            {editable && (
              <Button
                type="button"
                variant="outline"
                onClick={onEdit}
                className="h-11 w-full rounded-xl"
              >
                <Pencil />
                Edit
              </Button>
            )}
            {canSkipOccurrence && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSkipConfirming(true)}
                className="h-11 w-full rounded-xl"
              >
                <Trash2 />
                Skip
              </Button>
            )}
            {commitment.recurrence === "none" && !deleteConfirming && (
              <CalendarCommitmentDeleteControl
                commitment={commitment}
                confirming={false}
                onConfirmingChange={setDeleteConfirming}
                onSaved={onRemoved ?? onSaved}
                triggerLabel="Remove"
              />
            )}
          </DayItemSecondaryActions>
        }
        more={
          editable && recurringEvent ? (
            <DayItemMoreDisclosure
              open={moreOpen}
              onOpenChange={setMoreOpen}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={onEdit}
                className="h-10 w-full text-muted-foreground"
              >
                Change repeat
              </Button>
              <div className="contents" data-recurring-day-item-more>
                <StopCalendarRepeatingControl
                  commitment={commitment}
                  onSaved={onSaved}
                />
              </div>
            </DayItemMoreDisclosure>
          ) : undefined
        }
      />

      {commitment.recurrence === "none" && deleteConfirming && (
        <CalendarCommitmentDeleteControl
          commitment={commitment}
          confirming
          onConfirmingChange={setDeleteConfirming}
          onSaved={onRemoved ?? onSaved}
          showTrigger={false}
        />
      )}

      {skipConfirming && (
        <SkipCalendarOccurrenceConfirmation
          commitment={commitment}
          returnDate={skipReturnDate}
          onCancel={() => setSkipConfirming(false)}
          onSaved={onSaved}
        />
      )}

      {commitment.details && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Details</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {commitment.details}
          </p>
        </div>
      )}
    </div>
  );
}

function SkipCalendarOccurrenceConfirmation({
  commitment,
  returnDate,
  onCancel,
  onSaved,
}: {
  commitment: CalendarCommitment;
  returnDate?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, action] = useActionState(
    skipCalendarEventOccurrenceAction,
    initialCalendarActionState,
  );

  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, state.version, onSaved]);

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          Skip {commitment.title} on {formatOccurrenceDate(commitment.occurrence_date)}?
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Only this date will be skipped. Future repeats will continue.
        </p>
      </div>
      <form action={action} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <input
          type="hidden"
          name="occurrenceDate"
          value={commitment.occurrence_date}
        />
        {returnDate && (
          <input type="hidden" name="returnDate" value={returnDate} />
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <PendingButton type="submit" variant="destructive" pendingLabel="Skipping…">
          Skip
        </PendingButton>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">{state.error}</p>
      )}
    </div>
  );
}

function formatOccurrenceDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function StopCalendarRepeatingControl({
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

  const saved = useCallback(() => onSaved(), [onSaved]);
  useEffect(() => {
    if (state.saved) saved();
  }, [saved, state.saved, state.version]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="h-10 w-full text-muted-foreground"
      >
        Stop repeating
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Stop repeating “{commitment.title}”?</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Future repeats will stop. Past history will remain.
        </p>
      </div>
      <form action={action} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <PendingButton type="submit" variant="destructive" pendingLabel="Stopping…">
          Stop repeating
        </PendingButton>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">{state.error}</p>
      )}
    </div>
  );
}
