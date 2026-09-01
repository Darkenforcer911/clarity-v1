"use client";

import { CheckCircle2, ChevronDown, CircleOff, CirclePlus, History, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useState, useTransition } from "react";

import {
  correctHistoricalDailyActionOutcomeAction,
  createDayCorrectionAction,
  deleteDayCorrectionAction,
  updateDayCorrectionAction,
} from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import { Button } from "@/components/ui/button";
import type { CalendarHistoricalRecord } from "@/lib/clarity/calendar-service";
import {
  dayCorrectionLabel,
  type DayCorrection,
} from "@/lib/clarity/day-corrections";
import { formatCommitmentTime } from "@/lib/clarity/calendar-rules";
import { formatDuration } from "@/lib/clarity/duration";
import { applyHistoricalActionOutcomeRevisions } from "@/lib/clarity/historical-action-outcomes";
import { useAppShellEditorState } from "./app-shell-editor-context";
import { DayCorrectionForm } from "./day-correction-form";
import { HistoricalOutcomeCorrectionEditor } from "./historical-outcome-correction-editor";
import {
  RecapCompletedItemForm,
  type RecapCompletedItem,
} from "./recap-completed-item-form";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";
import { SwipeToRemove } from "./swipe-to-remove";

export function HistoricalDayActivity({
  record,
  timezone,
  localDate,
}: {
  record: CalendarHistoricalRecord | null;
  timezone: string;
  localDate: string;
}) {
  if (!record) return null;
  if (!record.planExists && !record.gapAcknowledged) return null;
  const originalSummary = record.summary;

  if (!originalSummary) {
    return (
      <section className="space-y-3">
        <HistorySectionHeading>Day activity</HistorySectionHeading>
        <p className="rounded-2xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
          {record.planExists
            ? "This day has no final Day Summary recorded."
            : "This date was acknowledged through Catch-Up. No Day Summary was created."}
        </p>
      </section>
    );
  }

  const summary = applyHistoricalActionOutcomeRevisions(
    originalSummary,
    record.actionOutcomeRevisions,
  );

  const progressed = summary.unfinishedActions.filter(
    (item) => item.outcome === "made_progress",
  );
  const missed = summary.unfinishedActions.filter(
    (item) => item.outcome === "not_done",
  );
  const closed = summary.unfinishedActions.filter((item) =>
    ["closed", "resolved_elsewhere"].includes(item.outcome),
  );
  const changed = summary.unfinishedActions.filter((item) =>
    ["rescheduled", "dropped"].includes(item.outcome),
  );
  const context = summary.contextSummary ?? record.notes;

  return (
    <section className="space-y-3">
      <HistorySectionHeading>Day activity</HistorySectionHeading>
      <p className="text-sm text-muted-foreground">
        {summary.completedCount} completed · {summary.totalCount} planned
      </p>
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {summary.completedActions.map((item) => (
          <HistoricalActionRow
            key={item.id}
            actionId={item.id}
            icon={<CheckCircle2 />}
            title={item.title}
            label={formatCompletedLabel(
              item.completedAt,
              timezone,
              item.approximateMinutes,
            )}
            currentOutcome="completed"
            completedAt={item.completedAt}
            timezone={timezone}
            localDate={localDate}
          />
        ))}
        {progressed.map((item) => (
          <HistoricalActionRow key={item.id} actionId={item.id} icon={<History />} title={item.title} label={item.approximateMinutes ? `Some progress · ${formatDuration(item.approximateMinutes)}` : "Some progress"} detail={item.progressNote} currentOutcome="other" timezone={timezone} localDate={localDate} />
        ))}
        {missed.map((item) => (
          <HistoricalActionRow key={item.id} actionId={item.id} icon={<CircleOff />} title={item.title} label="Didn’t happen" detail={item.notDoneNote} currentOutcome="missed" timezone={timezone} localDate={localDate} />
        ))}
        {closed.map((item) => (
          <HistoricalActionRow key={item.id} actionId={item.id} icon={<CircleOff />} title={item.title} label="No longer needed" detail={item.closeContext ?? item.resolvedElsewhereNote} currentOutcome="other" timezone={timezone} localDate={localDate} />
        ))}
        {changed.map((item) => (
          <HistoricalActionRow
            key={item.id}
            actionId={item.id}
            icon={<History />}
            title={item.title}
            label={item.outcome === "rescheduled" && item.rescheduledFor
              ? `Moved to ${formatLocalDateShort(item.rescheduledFor)}`
              : item.outcome === "rescheduled"
                ? "Moved"
                : record.actionResolutionNotes[item.id] === "Removed from today"
                  ? "Removed from today"
                  : "Dropped"}
            currentOutcome="other"
            timezone={timezone}
            localDate={localDate}
          />
        ))}
        {summary.unplannedProgress?.map((item, index) => (
          <HistoryRow
            key={typeof item === "string" ? `${item}-${index}` : `${item.title}-${index}`}
            icon={<CheckCircle2 />}
            title={typeof item === "string" ? item : item.title}
            label={typeof item === "string"
              ? "Unplanned completed item"
              : `${item.outcome === "finished" ? "Unplanned completed item" : "Unplanned progress"}${item.estimatedMinutes ? ` · ${formatDuration(item.estimatedMinutes)}` : ""}`}
            detail={typeof item === "string" ? null : item.progressNote}
          />
        ))}
        {summary.completedActions.length === 0 &&
          progressed.length === 0 &&
          missed.length === 0 &&
          closed.length === 0 &&
          changed.length === 0 &&
          (summary.unplannedProgress?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No action outcomes were recorded.</p>
          )}
      </div>
      {context && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Day reflection
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{context}</p>
        </div>
      )}
    </section>
  );
}

function HistoricalActionRow({
  actionId,
  icon,
  title,
  label,
  detail,
  currentOutcome,
  completedAt,
  timezone,
  localDate,
}: {
  actionId: string;
  icon: React.ReactNode;
  title: string;
  label: string;
  detail?: string | null;
  currentOutcome: "completed" | "missed" | "other";
  completedAt?: string | null;
  timezone: string;
  localDate: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialOutcome: "completed" | "missed" | "not_recorded" =
    currentOutcome === "completed"
      ? "completed"
      : currentOutcome === "missed"
        ? "missed"
        : "not_recorded";
  useAppShellEditorState(editing);
  async function submitCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await correctHistoricalDailyActionOutcomeAction(
      initialCalendarActionState,
      new FormData(event.currentTarget),
    );
    setSubmitting(false);
    if (!result.saved) {
      setError(result.error ?? "Couldn’t correct this outcome. Try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="flex min-h-11 gap-3">
        <span className="mt-0.5 [&_svg]:size-4 [&_svg]:text-[var(--clarity-completed)]">{icon}</span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/today/actions/${actionId}?from=calendar&date=${localDate}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {title}
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
          {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
          {!editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="mt-1 -ml-3 text-muted-foreground"
            >
              Correct outcome
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="ml-7 mt-2">
          <HistoricalOutcomeCorrectionEditor
            hiddenFields={<input type="hidden" name="actionId" value={actionId} />}
            options={[
              ["completed", "Completed"],
              ["missed", "Missed"],
              ["not_recorded", "Not recorded"],
            ] as const}
            initialOutcome={initialOutcome}
            completedOutcome="completed"
            initialCompletionTime={
              initialOutcome === "completed" && completedAt
                ? localTimeValue(completedAt, timezone)
                : ""
            }
            initialNote={detail ?? ""}
            noteMaxLength={500}
            noteAvailable={(value) => value === "missed"}
            supportingCopy="Confirming changes what Clarity shows now while keeping the earlier entry in history."
            submitting={submitting}
            error={error}
            onCancel={() => setEditing(false)}
            onSubmit={submitCorrection}
          />
        </div>
      )}
    </div>
  );
}

function formatCompletedLabel(
  completedAt: string | null | undefined,
  timezone: string,
  actualMinutes?: number | null,
) {
  const parts = ["Completed"];
  if (completedAt) {
    parts.push(
      new Intl.DateTimeFormat("en-AU", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(completedAt)),
    );
  }
  if (actualMinutes) parts.push(formatDuration(actualMinutes));
  return parts.join(" · ");
}

function localTimeValue(timestamp: string, timezone: string) {
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

function formatLocalDateShort(localDate: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${localDate}T00:00:00Z`));
}

export function CalendarCorrections({
  localDate,
  timezone,
  corrections,
}: {
  localDate: string;
  timezone: string;
  corrections: DayCorrection[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [swipedCorrectionId, setSwipedCorrectionId] = useState<string | null>(null);
  const close = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
    setSwipedCorrectionId(null);
  }, []);
  const saved = useCallback(() => {
    close();
    router.refresh();
  }, [close, router]);

  return (
    <section className="space-y-3">
      {corrections.length > 0 && (
        <>
          <HistorySectionHeading>Added activity</HistorySectionHeading>
          <p className="text-sm text-muted-foreground">
            {corrections.length} {corrections.length === 1 ? "item" : "items"} added later
          </p>
          <div className="space-y-2">
            {corrections.map((correction) =>
              editingId === correction.id ? (
                correction.correction_type === "completed_item" ? (
                  <CalendarCompletedItemEditor
                    key={correction.id}
                    localDate={localDate}
                    correction={correction}
                    onCancel={() => setEditingId(null)}
                    onSaved={saved}
                  />
                ) : (
                  <DayCorrectionForm
                    key={correction.id}
                    localDate={localDate}
                    correction={correction}
                    onCancel={() => setEditingId(null)}
                    onSaved={saved}
                  />
                )
              ) : (
                <CorrectionRow
                  key={correction.id}
                  correction={correction}
                  timezone={timezone}
                  onEdit={() => {
                    setFormOpen(false);
                    setSwipedCorrectionId(null);
                    setEditingId(correction.id);
                  }}
                  onSaved={saved}
                  swipeOpen={swipedCorrectionId === correction.id}
                  onSwipeOpenChange={(open) =>
                    setSwipedCorrectionId(open ? correction.id : null)
                  }
                />
              ),
            )}
          </div>
        </>
      )}

      <SecondarySettingDisclosure
        icon={CirclePlus}
        label="Add something completed"
        summary="Something you did that wasn't planned"
        expanded={formOpen}
        onExpandedChange={(open) => {
          setEditingId(null);
          setSwipedCorrectionId(null);
          setFormOpen(open);
        }}
        showDone={false}
      >
        {formOpen && (
          <CalendarCompletedItemEditor
            localDate={localDate}
            onCancel={close}
            onSaved={saved}
          />
        )}
      </SecondarySettingDisclosure>
    </section>
  );
}

function CalendarCompletedItemEditor({
  localDate,
  correction,
  onCancel,
  onSaved,
}: {
  localDate: string;
  correction?: DayCorrection;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, dispatch] = useActionState(
    correction ? updateDayCorrectionAction : createDayCorrectionAction,
    initialCalendarActionState,
  );
  const [pending, startTransition] = useTransition();
  useAppShellEditorState(true);

  useEffect(() => {
    if (state.saved) onSaved();
  }, [onSaved, state.saved, state.version]);

  function save(item: RecapCompletedItem) {
    const formData = new FormData();
    formData.set("localDate", localDate);
    formData.set("correctionType", "completed_item");
    formData.set("title", item.title);
    formData.set("occurredTime", item.completionTime);
    formData.set(
      "durationHours",
      item.actualMinutes === null
        ? ""
        : String(Math.floor(item.actualMinutes / 60)),
    );
    formData.set(
      "durationMinutes",
      item.actualMinutes === null
        ? ""
        : String(item.actualMinutes % 60),
    );
    formData.set("details", "");
    if (correction) formData.set("correctionId", correction.id);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="space-y-2">
      <RecapCompletedItemForm
        embedded
        initialItem={
          correction
            ? {
                id: correction.id,
                title: correction.title ?? "",
                completionTime: correction.occurred_time?.slice(0, 5) ?? "",
                actualMinutes: correction.duration_minutes,
              }
            : undefined
        }
        submitting={pending}
        onSave={save}
        onCancel={onCancel}
      />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}

function CorrectionRow({
  correction,
  timezone,
  onEdit,
  onSaved,
  swipeOpen,
  onSwipeOpenChange,
}: {
  correction: DayCorrection;
  timezone: string;
  onEdit: () => void;
  onSaved: () => void;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const display = correction.title ?? correction.details ?? "Day note";
  const time = formatCommitmentTime(correction.occurred_time);
  const duration = correction.duration_minutes
    ? formatDuration(correction.duration_minutes)
    : null;
  const addedAt = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(correction.created_at));

  async function removeCorrection() {
    if (deletionPending) return;

    setDeletionPending(true);
    setDeletionError(null);
    const formData = new FormData();
    formData.set("correctionId", correction.id);
    const result = await deleteDayCorrectionAction(
      initialCalendarActionState,
      formData,
    );

    if (result.saved) {
      onSwipeOpenChange(false);
      onSaved();
      return;
    }

    setDeletionPending(false);
    setDeletionError(result.error ?? "Couldn't remove this added activity.");
  }

  function toggleExpanded() {
    onSwipeOpenChange(false);
    setExpanded((current) => !current);
  }

  if (correction.correction_type === "completed_item") {
    return (
      <SwipeToRemove
        itemId={correction.id}
        itemTitle={display}
        open={swipeOpen}
        onOpenChange={onSwipeOpenChange}
        onRemove={removeCorrection}
        removalPending={deletionPending}
        removing={false}
        enabled
        accessibilityContext="from historical activity"
      >
        <article
          data-slot="historical-completed-activity-card"
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <button
            type="button"
            aria-expanded={expanded}
            onClick={toggleExpanded}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{display}</span>
              <span className="mt-0.5 flex items-center gap-1 text-sm text-[var(--clarity-completed)]">
                <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
                {`Done · ${time ?? "Anytime"}`}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
          {expanded && (
            <div className="space-y-3 border-t border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">Added {addedAt}</p>
              <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                <Pencil /> Edit
              </Button>
            </div>
          )}
          {deletionError && (
            <p role="alert" className="px-3 pb-3 text-xs text-destructive">
              {deletionError}
            </p>
          )}
        </article>
      </SwipeToRemove>
    );
  }

  return (
    <SwipeToRemove
      itemId={correction.id}
      itemTitle={display}
      open={swipeOpen}
      onOpenChange={onSwipeOpenChange}
      onRemove={removeCorrection}
      removalPending={deletionPending}
      removing={false}
      enabled
      accessibilityContext="from historical activity"
    >
      <article className="overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={toggleExpanded}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block whitespace-pre-wrap font-medium">{display}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {[time, duration].filter(Boolean).join(" · ")}
            </span>
            <span className="mt-1 block text-xs text-[var(--clarity-completed)]">
              {dayCorrectionLabel(correction.correction_type)} · Added later
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        {expanded && (
          <div className="space-y-3 border-t border-border px-3 py-3">
            <p className="text-xs text-muted-foreground">Added {addedAt}</p>
            {correction.title && correction.details && (
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {correction.details}
              </p>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          </div>
        )}
        {deletionError && (
          <p role="alert" className="px-3 pb-3 text-xs text-destructive">
            {deletionError}
          </p>
        )}
      </article>
    </SwipeToRemove>
  );
}

function HistoryRow({
  icon,
  title,
  label,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  label: string;
  detail?: string | null;
}) {
  return (
    <div className="flex min-h-11 gap-3 border-b border-border py-2 last:border-0">
      <span className="mt-0.5 [&_svg]:size-4 [&_svg]:text-[var(--clarity-completed)]">{icon}</span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
        {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function HistorySectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  );
}
