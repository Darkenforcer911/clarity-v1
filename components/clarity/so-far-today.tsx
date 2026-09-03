"use client";

import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  createCompletedPlanEvidenceAction,
  deleteCompletedPlanEvidenceAction,
  updateCompletedPlanEvidenceAction,
} from "@/app/(app)/today/reconciliation-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { formatScheduledTime } from "@/lib/clarity/date-time";
import { formatDuration } from "@/lib/clarity/duration";
import { initialProposedReconciliationActionState } from "@/lib/clarity/proposed-reconciliation-state";
import { DetailsControl } from "./details-control";
import { PendingButton } from "./pending-button";
import { SwipeToRemove } from "./swipe-to-remove";
import { TimeSelector } from "./time-selector";
import { TimeSpentField } from "./time-spent-field";

export function SoFarToday({
  planId,
  timezone,
  completedActions,
}: {
  planId: string;
  timezone: string;
  completedActions: DailyAction[];
}) {
  const [adding, setAdding] = useState(false);
  const hasContent = completedActions.length > 0;

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
        <section className="space-y-3" aria-label="Completed activity added today">
          <div className="space-y-3">
            {completedActions.map((action) => (
              <CompletedEvidenceRow
                key={action.id}
                action={action}
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
  const [completedTime, setCompletedTime] = useState("");
  const [actualMinutes, setActualMinutes] = useState("");
  const [details, setDetails] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [state, action] = useActionState(
    createCompletedPlanEvidenceAction,
    initialProposedReconciliationActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    formRef.current?.reset();
    const frame = window.requestAnimationFrame(() => {
      setCompletedTime("");
      setActualMinutes("");
      setDetails("");
      setDetailsExpanded(false);
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

      <TimeSelector
        name="completedTime"
        label="When"
        summary={formatTimeSummary(completedTime)}
        value={completedTime}
        onChange={setCompletedTime}
        onRemove={completedTime ? () => setCompletedTime("") : undefined}
      />
      <input type="hidden" name="actualMinutes" value={actualMinutes} />
      <TimeSpentField
        label="Actual duration"
        value={actualMinutes}
        onChange={setActualMinutes}
      />
      <DetailsControl
        name="details"
        value={details}
        onChange={setDetails}
        maxLength={2000}
        placeholder="Add useful context"
        expanded={detailsExpanded}
        onExpandedChange={setDetailsExpanded}
      />

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
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removalPending, startRemoval] = useTransition();
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

  const row = (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Check className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground">{action.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCompletedEvidenceSummary(
              completionTime,
              action.actual_minutes,
            )}
          </p>
          {action.details && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {action.details}
            </p>
          )}
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
      {removeError && <InlineError message={removeError} />}
    </article>
  );

  if (!action.completion_evidence_only) return row;

  return (
    <SwipeToRemove
      itemId={action.id}
      itemTitle={action.title}
      open={swipeOpen}
      onOpenChange={setSwipeOpen}
      onRemove={() => {
        if (removalPending) return;
        setRemoveError(null);
        setRemoving(true);
        startRemoval(async () => {
          try {
            const formData = new FormData();
            formData.set("actionId", action.id);
            await deleteCompletedPlanEvidenceAction(formData);
          } catch (error) {
            setRemoving(false);
            setSwipeOpen(false);
            setRemoveError(
              error instanceof Error
                ? error.message
                : "Couldn’t remove this completed item.",
            );
          }
        });
      }}
      removalPending={removalPending}
      removing={removing}
      enabled={!editing}
      accessibilityContext="from completed activity"
    >
      {row}
    </SwipeToRemove>
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
  const [completedTime, setCompletedTime] = useState(() =>
    formatTimeInput(action.completed_at, timezone),
  );
  const [actualMinutes, setActualMinutes] = useState(
    action.actual_minutes?.toString() ?? "",
  );
  const [details, setDetails] = useState(action.details ?? "");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
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
        <TimeSelector
          name="completedTime"
          label="When"
          summary={formatTimeSummary(completedTime)}
          value={completedTime}
          onChange={setCompletedTime}
          onRemove={completedTime ? () => setCompletedTime("") : undefined}
        />
        <input type="hidden" name="actualMinutes" value={actualMinutes} />
        <TimeSpentField
          label="Actual duration"
          value={actualMinutes}
          onChange={setActualMinutes}
        />
        <DetailsControl
          name="details"
          value={details}
          onChange={setDetails}
          maxLength={2000}
          placeholder="Add useful context"
          expanded={detailsExpanded}
          onExpandedChange={setDetailsExpanded}
        />
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

function formatTimeSummary(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "Anytime";
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

function formatCompletedEvidenceSummary(
  completionTime: string | null,
  actualMinutes: number | null,
) {
  const parts = [completionTime ? `Completed ${completionTime}` : "Completed"];
  if (actualMinutes) parts.push(formatDuration(actualMinutes));
  return parts.join(" · ");
}
