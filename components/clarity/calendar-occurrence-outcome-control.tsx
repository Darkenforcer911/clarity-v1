"use client";

import { useState } from "react";

import { correctCalendarEventOccurrenceOutcomeAction } from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import { Button } from "@/components/ui/button";
import { useAppShellEditorState } from "./app-shell-editor-context";
import { HistoricalOutcomeCorrectionEditor } from "./historical-outcome-correction-editor";

export function CalendarOccurrenceOutcomeControl({
  commitment,
  timezone,
  onSaved,
  currentDay,
}: {
  commitment: CalendarCommitment;
  timezone: string;
  onSaved: () => void;
  currentDay: boolean;
}) {
  const [editing, setEditing] = useState(currentDay);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialOutcome:
    | "attended"
    | "missed"
    | "cancelled"
    | "not_recorded" =
    commitment.reconciliation_outcome === "attended" ||
    commitment.reconciliation_outcome === "missed" ||
    commitment.reconciliation_outcome === "cancelled"
      ? commitment.reconciliation_outcome
      : "not_recorded";

  useAppShellEditorState(editing);

  async function submitCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await correctCalendarEventOccurrenceOutcomeAction(
      initialCalendarActionState,
      new FormData(event.currentTarget),
    );
    setSubmitting(false);
    if (!result.saved) {
      setError(result.error ?? "Couldn’t correct this outcome. Try again.");
      return;
    }
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setEditing(true)}
        className="h-11 w-full text-muted-foreground"
      >
        {currentDay ? "Update status" : "Correct outcome"}
      </Button>
    );
  }

  return (
    <HistoricalOutcomeCorrectionEditor
      title={currentDay ? "Update status" : "Correct outcome"}
      submitLabel={currentDay ? "Save" : "Confirm correction"}
      submittingLabel={currentDay ? "Saving…" : "Correcting…"}
      hiddenFields={
        <>
          <input type="hidden" name="commitmentId" value={commitment.id} />
          <input
            type="hidden"
            name="occurrenceDate"
            value={commitment.occurrence_date}
          />
        </>
      }
      options={[
        ["attended", "Completed"],
        ["missed", "Missed"],
        ["cancelled", "Cancelled"],
      ] as const}
      initialOutcome={initialOutcome}
      completedOutcome="attended"
      initialCompletionTime={
        initialOutcome === "attended" && commitment.completed_at
          ? formatTimestampAsLocalTime(commitment.completed_at, timezone)
          : ""
      }
      initialNote={commitment.outcome_note ?? ""}
      noteMaxLength={1000}
      noteAvailable={(value) => value !== "not_recorded"}
      supportingCopy={
        currentDay
          ? "This updates only this date. The repeating commitment stays unchanged."
          : "This corrects only this date. The repeating commitment stays unchanged."
      }
      submitting={submitting}
      error={error}
      onCancel={() => setEditing(false)}
      onSubmit={submitCorrection}
    />
  );
}

function formatTimestampAsLocalTime(timestamp: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
