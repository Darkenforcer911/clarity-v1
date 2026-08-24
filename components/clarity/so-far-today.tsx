"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  createCompletedPlanEvidenceAction,
  deleteCompletedPlanEvidenceAction,
  recordCalendarEventOutcomeAction,
  updateCompletedPlanEvidenceAction,
} from "@/app/(app)/today/reconciliation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarCommitment } from "@/lib/clarity/calendar-commitments";
import {
  formatCalendarOutcomeLabel,
  formatCalendarOutcomeStatus,
  formatCommitmentTime,
  getCommitmentTime,
} from "@/lib/clarity/calendar-commitments";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { formatScheduledTime } from "@/lib/clarity/date-time";
import { initialProposedReconciliationActionState } from "@/lib/clarity/proposed-reconciliation-state";
import { PendingButton } from "./pending-button";

export function SoFarToday({
  planId,
  planDate,
  timezone,
  completedActions,
  calendarEvents,
}: {
  planId: string;
  planDate: string;
  timezone: string;
  completedActions: DailyAction[];
  calendarEvents: CalendarCommitment[];
}) {
  const [adding, setAdding] = useState(false);
  const hasContent = completedActions.length > 0 || calendarEvents.length > 0;

  return (
    <div className="min-w-0 space-y-4">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setAdding((current) => !current)}
        className="h-11 w-auto justify-start rounded-lg px-2 text-muted-foreground"
      >
        <Plus />
        Add something else completed
      </Button>

      {adding && (
        <CompletedEvidenceForm
          planId={planId}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {hasContent && (
        <section className="space-y-3" aria-labelledby="so-far-heading">
          <h2 id="so-far-heading" className="text-lg font-semibold">
            So far today
          </h2>
          <div className="space-y-3">
            {completedActions.map((action) => (
              <CompletedEvidenceRow
                key={action.id}
                action={action}
                timezone={timezone}
              />
            ))}
            {calendarEvents.map((commitment) => (
              <CalendarOutcomeRow
                key={`${commitment.id}:${commitment.occurrence_date}`}
                commitment={commitment}
                planDate={planDate}
                timezone={timezone}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CompletedEvidenceForm({
  planId,
  onCancel,
  onSaved,
}: {
  planId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [showTime, setShowTime] = useState(false);
  const [state, action] = useActionState(
    createCompletedPlanEvidenceAction,
    initialProposedReconciliationActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    formRef.current?.reset();
    const frame = window.requestAnimationFrame(() => {
      setShowTime(false);
      onSaved();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onSaved, state.savedAt]);

  return (
    <form
      ref={formRef}
      action={action}
      data-reconciliation-form
      className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4"
    >
      <input type="hidden" name="planId" value={planId} />
      <label className="block space-y-2 text-sm font-medium">
        <span>What did you complete?</span>
        <Input name="title" required maxLength={200} autoFocus />
      </label>

      {!showTime ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowTime(true)}
          className="h-10 w-auto px-2 text-muted-foreground"
        >
          <Plus /> Add time
        </Button>
      ) : (
        <label className="block min-w-0 space-y-2 text-sm font-medium">
          <span>Completion time</span>
          <div className="min-w-0 w-full max-w-full overflow-hidden">
            <Input
              type="time"
              name="completedTime"
              className="min-w-0 w-full max-w-full"
            />
          </div>
        </label>
      )}

      {state.error && <InlineError message={state.error} />}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <PendingButton type="submit" pendingLabel="Adding…">
          Add completed item
        </PendingButton>
      </div>
    </form>
  );
}

function CompletedEvidenceRow({
  action,
  timezone,
}: {
  action: DailyAction;
  timezone: string;
}) {
  const [editing, setEditing] = useState(false);
  const completionTime = formatScheduledTime(action.completed_at, timezone);

  if (editing && action.completion_evidence_only) {
    return (
      <EditCompletedEvidenceForm
        action={action}
        timezone={timezone}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Check className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground">{action.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {completionTime ? `Completed ${completionTime}` : "Completed"}
          </p>
        </div>
        {action.completion_evidence_only && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="shrink-0 text-muted-foreground"
          >
            <Pencil /> Edit
          </Button>
        )}
      </div>
    </article>
  );
}

function EditCompletedEvidenceForm({
  action,
  timezone,
  onClose,
}: {
  action: DailyAction;
  timezone: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(
    updateCompletedPlanEvidenceAction,
    initialProposedReconciliationActionState,
  );

  useEffect(() => {
    if (state.savedAt) onClose();
  }, [onClose, state.savedAt]);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <form action={formAction} data-reconciliation-form className="space-y-4">
        <input type="hidden" name="actionId" value={action.id} />
        <label className="block space-y-2 text-sm font-medium">
          <span>What did you complete?</span>
          <Input name="title" required maxLength={200} defaultValue={action.title} />
        </label>
        <label className="block min-w-0 space-y-2 text-sm font-medium">
          <span>Completion time — optional</span>
          <Input
            type="time"
            name="completedTime"
            defaultValue={formatTimeInput(action.completed_at, timezone)}
            className="min-w-0 w-full max-w-full"
          />
        </label>
        {state.error && <InlineError message={state.error} />}
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <PendingButton type="submit" pendingLabel="Saving…">
            Save
          </PendingButton>
        </div>
      </form>
      <form action={deleteCompletedPlanEvidenceAction}>
        <input type="hidden" name="actionId" value={action.id} />
        <PendingButton
          type="submit"
          variant="ghost"
          pendingLabel="Removing…"
          className="h-10 w-auto px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 /> Remove
        </PendingButton>
      </form>
    </div>
  );
}

function CalendarOutcomeRow({
  commitment,
  planDate,
  timezone,
}: {
  commitment: CalendarCommitment;
  planDate: string;
  timezone: string;
}) {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [state, action] = useActionState(
    recordCalendarEventOutcomeAction,
    initialProposedReconciliationActionState,
  );
  const outcome = commitment.reconciliation_outcome ?? null;
  const displayOutcome = outcome
    ? formatCalendarOutcomeStatus(commitment, timezone)
    : null;

  if (outcome) {
    return (
      <article className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-[var(--clarity-completed)]">
          {formatCommitmentTime(getCommitmentTime(commitment))}
        </p>
        <h3 className="mt-1 font-medium">{commitment.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{displayOutcome}</p>
        {commitment.outcome_note && (
          <p className="mt-1 text-sm leading-6 text-secondary-foreground">
            {commitment.outcome_note}
          </p>
        )}
      </article>
    );
  }

  return (
    <article className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-medium text-[var(--clarity-completed)]">
          {formatCommitmentTime(getCommitmentTime(commitment))}
        </p>
        <h3 className="mt-1 font-medium">{commitment.title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["attended", "missed", "cancelled", "rescheduled"] as const).map(
          (value) => (
            <Button
              key={value}
              type="button"
              variant={selectedOutcome === value ? "default" : "outline"}
              onClick={() => setSelectedOutcome(value)}
              className="h-11 rounded-xl"
            >
              {formatCalendarOutcomeLabel(value)}
            </Button>
          ),
        )}
      </div>
      {selectedOutcome && (
        <form action={action} data-reconciliation-form className="space-y-4">
          <input type="hidden" name="commitmentId" value={commitment.id} />
          <input type="hidden" name="occurrenceDate" value={planDate} />
          <input type="hidden" name="outcome" value={selectedOutcome} />
          {selectedOutcome === "rescheduled" && (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <label className="min-w-0 space-y-2 text-sm font-medium">
                <span>New date</span>
                <Input type="date" name="newDate" required className="min-w-0 w-full max-w-full" />
              </label>
              <label className="min-w-0 space-y-2 text-sm font-medium">
                <span>New time</span>
                <Input type="time" name="newTime" required className="min-w-0 w-full max-w-full" />
              </label>
            </div>
          )}
          <label className="block space-y-2 text-sm font-medium">
            <span>{outcomeNoteLabel(selectedOutcome)}</span>
            <Textarea name="note" maxLength={1000} rows={2} />
          </label>
          {state.error && <InlineError message={state.error} />}
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => setSelectedOutcome(null)}>
              Cancel
            </Button>
            <PendingButton type="submit" pendingLabel="Saving…">
              Save outcome
            </PendingButton>
          </div>
        </form>
      )}
    </article>
  );
}

function outcomeNoteLabel(outcome: string) {
  if (outcome === "attended") return "Anything come from it? — optional";
  if (outcome === "missed") return "What needs to happen next? — optional";
  if (outcome === "cancelled") return "Reason — optional";
  return "Details — optional";
}

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm">
      {message}
    </p>
  );
}

function formatTimeInput(value: string | null, timezone: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
