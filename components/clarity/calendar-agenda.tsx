"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";

import {
  cancelCalendarCommitmentAction,
  correctCalendarEventOccurrenceOutcomeAction,
  deleteCalendarCommitmentAction,
  skipCalendarEventOccurrenceAction,
} from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCommitmentRecurrence,
  formatCalendarOutcomeStatus,
  getCommitmentMeta,
  getCommitmentTimingState,
  sortCalendarCommitments,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";
import {
  addLocalDays,
  formatFullLocalDate,
  formatWeekday,
} from "@/lib/clarity/date-time";
import type { CalendarHistoricalRecord } from "@/lib/clarity/calendar-service";
import type { DayCorrection } from "@/lib/clarity/day-corrections";
import {
  getCalendarDateMode,
  resolveCalendarCommitmentSelection,
} from "@/lib/clarity/calendar-rules";
import { CalendarCommitmentForm } from "./calendar-commitment-form";
import { useAppShellEditorState } from "./app-shell-editor-context";
import {
  CalendarCorrections,
  HistoricalDayActivity,
} from "./calendar-history";
import { HistoricalOutcomeCorrectionEditor } from "./historical-outcome-correction-editor";
import { PendingButton } from "./pending-button";
import { SwipeToRemove } from "./swipe-to-remove";
import { CalendarDailyActions } from "./calendar-daily-actions";
import type { CalendarDailyAction } from "@/lib/clarity/calendar-daily-actions";

export function CalendarAgenda({
  selectedDate,
  today,
  timezone,
  commitments,
  dailyActions,
  corrections,
  historicalRecord,
  stripDates,
  initialNow,
  initialCommitmentId,
}: {
  selectedDate: string;
  today: string;
  timezone: string;
  commitments: CalendarCommitment[];
  dailyActions: CalendarDailyAction[];
  corrections: DayCorrection[];
  historicalRecord: CalendarHistoricalRecord | null;
  stripDates: string[];
  initialNow: string;
  initialCommitmentId?: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialNow));
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() =>
    resolveCalendarCommitmentSelection(initialCommitmentId, commitments),
  );
  const [swipedCommitmentId, setSwipedCommitmentId] = useState<string | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const mode = getCalendarDateMode(selectedDate, today);
  const isPast = mode === "past";
  const sorted = sortCalendarCommitments(commitments);
  const events = sorted.filter((item) => item.commitment_type === "event");
  const deadlines = sorted.filter((item) => item.commitment_type === "deadline");
  const closeForm = useCallback(() => {
    setAddOpen(false);
    setEditingId(null);
  }, []);
  const handleSaved = useCallback(() => {
    closeForm();
    router.refresh();
  }, [closeForm, router]);

  useEffect(() => {
    let timer = 0;
    const refresh = () => setNow(new Date());
    const schedule = () => {
      timer = window.setTimeout(() => {
        refresh();
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    const visible = () => document.visibilityState === "visible" && refresh();
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    if (!swipedCommitmentId) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setSwipedCommitmentId(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>("[data-swipe-action-id]");
      if (swipedCard?.dataset.swipeActionId !== swipedCommitmentId) {
        setSwipedCommitmentId(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [swipedCommitmentId]);

  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Calendar
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--clarity-completed)]">
          {mode}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          {formatFullLocalDate(selectedDate)}
        </h1>
      </header>

      <div className="space-y-3">
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_2.75rem] items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Previous week">
            <Link href={`/calendar?date=${addLocalDays(selectedDate, -7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setJumpOpen((current) => !current)}
            className="h-10 min-w-0 justify-start overflow-hidden rounded-xl px-2"
          >
            <span className="truncate">{formatMonthYear(selectedDate)}</span>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-xl">
            <Link href={`/calendar?date=${today}`}>Today</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Next week">
            <Link href={`/calendar?date=${addLocalDays(selectedDate, 7)}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>

        {jumpOpen && (
          <form
            className="flex min-w-0 items-end gap-2 rounded-xl border border-border bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(`/calendar?date=${jumpDate}`);
              setJumpOpen(false);
            }}
          >
            <label className="min-w-0 flex-1 text-sm font-medium">
              Jump to date
              <Input
                type="date"
                value={jumpDate}
                onChange={(event) => setJumpDate(event.target.value)}
                required
                className="mt-1.5 h-11"
              />
            </label>
            <Button type="submit" className="h-11 shrink-0">
              Go
            </Button>
          </form>
        )}

        <div className="grid min-w-0 grid-cols-7 gap-1">
          {stripDates.map((date) => {
            const selected = date === selectedDate;

            return (
              <Link
                key={date}
                href={`/calendar?date=${date}`}
                aria-current={selected ? "date" : undefined}
                className={`calendar-date-chip flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-transparent text-muted-foreground active:bg-secondary"
                }`}
              >
                <span>{formatWeekday(date).slice(0, 2)}</span>
                <span className="mt-1 font-semibold">
                  {Number(date.slice(8, 10))}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {isPast && (
        <HistoricalDayActivity
          record={historicalRecord}
          timezone={timezone}
          localDate={selectedDate}
        />
      )}

      <CalendarDailyActions
        actions={dailyActions}
        localDate={selectedDate}
        today={today}
        timezone={timezone}
      />

      {events.length > 0 && (
        <AgendaSection
          title="Events"
          commitments={events}
          selectedDate={selectedDate}
          today={today}
          timezone={timezone}
          now={now}
          openId={openId}
          editingId={editingId}
          swipedCommitmentId={swipedCommitmentId}
          onOpen={(id) => {
            setSwipedCommitmentId(null);
            setOpenId((current) => (current === id ? null : id));
          }}
          onSwipeOpenChange={(id) => setSwipedCommitmentId(id)}
          onEdit={setEditingId}
          onSaved={handleSaved}
          onCancelEdit={() => setEditingId(null)}
          readOnly={isPast}
        />
      )}

      {deadlines.length > 0 && (
        <AgendaSection
          title="Deadlines"
          commitments={deadlines}
          selectedDate={selectedDate}
          today={today}
          timezone={timezone}
          now={now}
          openId={openId}
          editingId={editingId}
          swipedCommitmentId={swipedCommitmentId}
          onOpen={(id) => {
            setSwipedCommitmentId(null);
            setOpenId((current) => (current === id ? null : id));
          }}
          onSwipeOpenChange={(id) => setSwipedCommitmentId(id)}
          onEdit={setEditingId}
          onSaved={handleSaved}
          onCancelEdit={() => setEditingId(null)}
          readOnly={isPast}
        />
      )}

      {!isPast &&
        events.length === 0 &&
        deadlines.length === 0 &&
        dailyActions.length === 0 &&
        !addOpen && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <CalendarDays className="mb-3 size-6 text-[var(--clarity-completed)]" />
          <p className="text-sm text-muted-foreground">
            Nothing scheduled for {formatWeekday(selectedDate)}.
          </p>
        </div>
      )}

      {isPast &&
        !historicalRecord?.planExists &&
        !historicalRecord?.gapAcknowledged &&
        events.length === 0 &&
        deadlines.length === 0 &&
        dailyActions.length === 0 &&
        corrections.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="font-medium">
              No day record for {formatWeekday(selectedDate)}.
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You can add something completed if activity is missing.
            </p>
          </div>
        )}

      {isPast && (
        <CalendarCorrections
          localDate={selectedDate}
          timezone={timezone}
          corrections={corrections}
        />
      )}

      {!isPast && (addOpen ? (
        <CalendarCommitmentForm
          selectedDate={selectedDate}
          timezone={timezone}
          now={now}
          onCancel={closeForm}
          onSaved={handleSaved}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setEditingId(null);
            setAddOpen(true);
          }}
          className="h-12 w-full rounded-xl text-base"
        >
          <Plus />
          Add commitment
        </Button>
      ))}
    </section>
  );
}

function AgendaSection({
  title,
  commitments,
  selectedDate,
  today,
  timezone,
  now,
  openId,
  editingId,
  swipedCommitmentId,
  onOpen,
  onSwipeOpenChange,
  onEdit,
  onSaved,
  onCancelEdit,
  readOnly,
}: {
  title: string;
  commitments: CalendarCommitment[];
  selectedDate: string;
  today: string;
  timezone: string;
  now: Date;
  openId: string | null;
  editingId: string | null;
  swipedCommitmentId: string | null;
  onOpen: (id: string) => void;
  onSwipeOpenChange: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onSaved: () => void;
  onCancelEdit: () => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">
        {commitments.map((commitment) =>
          !readOnly && editingId === commitment.id ? (
            <CalendarCommitmentForm
              key={commitment.id}
              selectedDate={selectedDate}
              timezone={timezone}
              now={now}
              commitment={commitment}
              onCancel={onCancelEdit}
              onSaved={onSaved}
            />
          ) : (
            <CommitmentRow
              key={commitment.id}
              commitment={commitment}
              today={today}
              timezone={timezone}
              now={now}
              open={openId === commitment.id}
              swipeOpen={swipedCommitmentId === commitment.id}
              onOpen={() => onOpen(commitment.id)}
              onSwipeOpenChange={(open) =>
                onSwipeOpenChange(open ? commitment.id : null)
              }
              onEdit={() => onEdit(commitment.id)}
              onSaved={onSaved}
              readOnly={readOnly}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CommitmentRow({
  commitment,
  today,
  timezone,
  now,
  open,
  swipeOpen,
  onOpen,
  onSwipeOpenChange,
  onEdit,
  onSaved,
  readOnly,
}: {
  commitment: CalendarCommitment;
  today: string;
  timezone: string;
  now: Date;
  open: boolean;
  swipeOpen: boolean;
  onOpen: () => void;
  onSwipeOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onSaved: () => void;
  readOnly: boolean;
}) {
  const timingState = getCommitmentTimingState(commitment, timezone, now);
  const recurrence = formatCommitmentRecurrence(commitment);
  const dueLabel = getDueLabel(commitment, today);
  const displayedStatus =
    readOnly && commitment.status === "scheduled"
      ? "Outcome not recorded"
      : commitment.reconciliation_outcome
        ? formatCalendarOutcomeStatus(commitment, timezone)
        : timingState !== "scheduled"
        ? formatTimingState(timingState)
        : null;
  const recurringEvent =
    commitment.commitment_type === "event" && commitment.recurrence !== "none";
  const canSkipThisOccurrence =
    recurringEvent &&
    commitment.occurrence_date === today &&
    commitment.status === "scheduled" &&
    !commitment.reconciliation_outcome;
  const [deletionPending, setDeletionPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  async function handleDelete() {
    if (deletionPending) return;

    setDeletionPending(true);
    setDeletionError(null);
    const formData = new FormData();
    formData.set("commitmentId", commitment.id);

    try {
      const result = await deleteCalendarCommitmentAction(
        initialCalendarActionState,
        formData,
      );
      if (!result.saved) {
        setDeletionError(
          result.error ?? "Couldn’t delete the commitment. Try again.",
        );
        onSwipeOpenChange(false);
        return;
      }

      setRemoving(true);
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 190;
      window.setTimeout(() => {
        onSwipeOpenChange(false);
        onSaved();
      }, delay);
    } catch {
      setDeletionError("Couldn’t delete the commitment. Try again.");
      onSwipeOpenChange(false);
    } finally {
      setDeletionPending(false);
    }
  }

  return (
    <SwipeToRemove
      itemId={commitment.id}
      itemTitle={commitment.title}
      open={swipeOpen}
      onOpenChange={onSwipeOpenChange}
      onRemove={handleDelete}
      removalPending={deletionPending}
      removing={removing}
      enabled={!readOnly}
      accessibilityContext="from Calendar"
      actionLabel="Delete"
      pendingLabel="Deleting…"
    >
      <article className="min-w-0 rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-14 w-full min-w-0 items-start gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">
              {commitment.title}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {[getCommitmentMeta(commitment), dueLabel, recurrence]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {displayedStatus && (
              <span className="mt-1 block text-xs font-medium text-[var(--clarity-completed)]">
                {displayedStatus}
              </span>
            )}
          </span>
        </button>

        {deletionError && (
          <p role="alert" className="px-4 pb-3 text-xs text-destructive">
            {deletionError}
          </p>
        )}

        {open && (
          <div className="space-y-4 border-t border-border px-4 py-4">
            {commitment.details && (
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {commitment.details}
              </p>
            )}
            {!readOnly && (
              <div className="space-y-2">
                {commitment.status === "scheduled" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onEdit}
                    className="h-11 w-full"
                  >
                    {recurringEvent
                      ? "Edit recurring commitment"
                      : "Edit commitment"}
                  </Button>
                )}
                {canSkipThisOccurrence && (
                  <SkipCalendarEventOccurrenceControl
                    commitment={commitment}
                    onSaved={onSaved}
                  />
                )}
                <CommitmentMutationControls
                  commitment={commitment}
                  onSaved={onSaved}
                />
              </div>
            )}
            {commitment.commitment_type === "event" &&
              (readOnly ||
                (commitment.occurrence_date === today &&
                  isRecordedCalendarOutcome(
                    commitment.reconciliation_outcome,
                  ))) && (
                <CorrectCalendarOutcomeControl
                  commitment={commitment}
                  timezone={timezone}
                  onSaved={onSaved}
                  currentDay={!readOnly}
                />
              )}
          </div>
        )}
      </article>
    </SwipeToRemove>
  );
}

function SkipCalendarEventOccurrenceControl({
  commitment,
  onSaved,
}: {
  commitment: CalendarCommitment;
  onSaved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [skipState, skipAction] = useActionState(
    skipCalendarEventOccurrenceAction,
    initialCalendarActionState,
  );

  useEffect(() => {
    if (skipState.saved) onSaved();
  }, [skipState.saved, skipState.version, onSaved]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="h-11 w-full text-muted-foreground"
      >
        Skip this occurrence
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Skip this occurrence?</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Only this date will be cancelled. The recurring commitment will
          continue.
        </p>
      </div>
      <form action={skipAction} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <input
          type="hidden"
          name="occurrenceDate"
          value={commitment.occurrence_date}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
        <PendingButton
          type="submit"
          variant="destructive"
          pendingLabel="Skipping…"
        >
          Skip
        </PendingButton>
      </form>
      {skipState.error && (
        <p role="alert" className="text-xs text-destructive">
          {skipState.error}
        </p>
      )}
    </div>
  );
}

function CorrectCalendarOutcomeControl({
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
    "attended" | "missed" | "cancelled" | "not_recorded"
  =
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
          ? "This updates only today’s occurrence. The recurring commitment stays unchanged."
          : "This corrects only this occurrence. The recurring commitment stays unchanged."
      }
      submitting={submitting}
      error={error}
      onCancel={() => setEditing(false)}
      onSubmit={submitCorrection}
    />
  );
}

function isRecordedCalendarOutcome(
  outcome: CalendarCommitment["reconciliation_outcome"],
) {
  return (
    outcome === "attended" ||
    outcome === "missed" ||
    outcome === "cancelled"
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

function CommitmentMutationControls({
  commitment,
  onSaved,
}: {
  commitment: CalendarCommitment;
  onSaved: () => void;
}) {
  const recurringEvent =
    commitment.commitment_type === "event" && commitment.recurrence !== "none";
  const [confirming, setConfirming] = useState(false);
  const [cancelState, cancelAction] = useActionState(
    cancelCalendarCommitmentAction,
    initialCalendarActionState,
  );

  useEffect(() => {
    if (cancelState.saved) onSaved();
  }, [cancelState.saved, cancelState.version, onSaved]);

  if (!confirming) {
    return commitment.status === "scheduled" ? (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="h-11 w-full text-muted-foreground"
      >
        {recurringEvent ? "Cancel recurring series" : "Cancel commitment"}
      </Button>
    ) : null;
  }

  return (
    <div className="space-y-3 rounded-xl bg-secondary p-3">
      <p className="text-sm font-medium">
        {recurringEvent
          ? "Cancel this recurring series?"
          : "Cancel this commitment?"}
      </p>
      <form action={cancelAction} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="commitmentId" value={commitment.id} />
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
        <PendingButton type="submit" variant="destructive" pendingLabel="Working…">
          Cancel
        </PendingButton>
      </form>
      {cancelState.error && (
        <p role="alert" className="text-xs text-destructive">
          {cancelState.error}
        </p>
      )}
    </div>
  );
}

function getDueLabel(commitment: CalendarCommitment, today: string) {
  if (commitment.commitment_type !== "deadline") return null;
  if (commitment.occurrence_date === today) return "Due today";
  if (commitment.occurrence_date === addLocalDays(today, 1)) return "Due tomorrow";
  return `Due ${formatFullLocalDate(commitment.occurrence_date)}`;
}

function formatTimingState(state: ReturnType<typeof getCommitmentTimingState>) {
  if (state === "time_passed") return "Time passed";
  if (state === "overdue") return "Overdue";
  if (state === "attended") return "Completed";
  return state[0].toUpperCase() + state.slice(1);
}

function formatMonthYear(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
