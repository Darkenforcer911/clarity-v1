"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
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
} from "@/lib/clarity/calendar-rules";
import { CalendarCommitmentForm } from "./calendar-commitment-form";
import { CalendarCommitmentDeleteControl } from "./calendar-commitment-delete-control";
import {
  CalendarCorrections,
  HistoricalDayActivity,
} from "./calendar-history";
import { SwipeToRemove } from "./swipe-to-remove";
import { CalendarActionRow } from "./calendar-daily-actions";
import { AddActionForm } from "./add-action-form";
import {
  partitionCalendarDailyActions,
  type CalendarDailyAction,
} from "@/lib/clarity/calendar-daily-actions";
import {
  orderLaterTodayItems,
  type LaterTodayItem,
} from "@/lib/clarity/today-display-order";
import { resolveShapeTodaySwipeItem } from "@/lib/clarity/shape-today-swipe";

type CalendarDayItem = LaterTodayItem<
  CalendarDailyAction,
  CalendarCommitment
>;

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
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialNow));
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<
    "action" | "event" | "deadline" | null
  >(null);
  const [openSwipeItemKey, setOpenSwipeItemKey] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const mode = getCalendarDateMode(selectedDate, today);
  const isPast = mode === "past";
  const sorted = sortCalendarCommitments(commitments);
  const events = sorted.filter((item) => item.commitment_type === "event");
  const deadlines = sorted.filter((item) => item.commitment_type === "deadline");
  const {
    due: dueActions,
    timed: timedActions,
    untimed: anytimeActions,
  } = partitionCalendarDailyActions(dailyActions);
  const scheduleItems = orderLaterTodayItems({
    actions: timedActions,
    commitments: events,
    timezone,
  });
  const anytimeItems = anytimeActions.map((value) => ({
    kind: "action" as const,
    value,
  }));
  const dueItems: CalendarDayItem[] = [
    ...dueActions.map((value) => ({
      kind: "action" as const,
      value,
    })),
    ...deadlines.map((value) => ({
      kind: "commitment" as const,
      value,
    })),
  ];
  const closeForm = useCallback(() => {
    setAddOpen(false);
    setAddKind(null);
    setOpenSwipeItemKey(null);
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
    if (!openSwipeItemKey) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenSwipeItemKey(null);
        return;
      }

      const swipedCard = target.closest<HTMLElement>("[data-swipe-action-id]");
      if (swipedCard?.dataset.swipeActionId !== openSwipeItemKey) {
        setOpenSwipeItemKey(null);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [openSwipeItemKey]);

  const handleSwipeOpenChange = useCallback(
    (itemKey: string, open: boolean) => {
      setOpenSwipeItemKey((currentItemKey) =>
        resolveShapeTodaySwipeItem(currentItemKey, itemKey, open),
      );
    },
    [],
  );

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
            <Link
              href={`/calendar?date=${addLocalDays(selectedDate, -7)}`}
              onClick={() => setOpenSwipeItemKey(null)}
            >
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
            <Link
              href={`/calendar?date=${today}`}
              onClick={() => setOpenSwipeItemKey(null)}
            >
              Today
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Next week">
            <Link
              href={`/calendar?date=${addLocalDays(selectedDate, 7)}`}
              onClick={() => setOpenSwipeItemKey(null)}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>

        {jumpOpen && (
          <form
            className="flex min-w-0 items-end gap-2 rounded-xl border border-border bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault();
              setOpenSwipeItemKey(null);
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
                onClick={() => setOpenSwipeItemKey(null)}
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

      <CalendarDaySection
        title="Schedule"
        items={scheduleItems}
        actionPresentation="timed"
        selectedDate={selectedDate}
        today={today}
        timezone={timezone}
        now={now}
        openSwipeItemKey={openSwipeItemKey}
        onOpenAction={() => setOpenSwipeItemKey(null)}
        onSwipeOpenChange={handleSwipeOpenChange}
        onSaved={handleSaved}
        readOnly={isPast}
      />

      <CalendarDaySection
        title="Anytime"
        items={anytimeItems}
        actionPresentation="untimed"
        selectedDate={selectedDate}
        today={today}
        timezone={timezone}
        now={now}
        openSwipeItemKey={openSwipeItemKey}
        onOpenAction={() => setOpenSwipeItemKey(null)}
        onSwipeOpenChange={handleSwipeOpenChange}
        onSaved={handleSaved}
        readOnly={isPast}
      />

      <CalendarDaySection
        title="Due"
        items={dueItems}
        actionPresentation="due"
        selectedDate={selectedDate}
        today={today}
        timezone={timezone}
        now={now}
        openSwipeItemKey={openSwipeItemKey}
        onOpenAction={() => setOpenSwipeItemKey(null)}
        onSwipeOpenChange={handleSwipeOpenChange}
        onSaved={handleSaved}
        readOnly={isPast}
      />

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

      {!isPast && addOpen && addKind === "action" && (
        <AddActionForm
          localDate={selectedDate}
          timezone={timezone}
          destination="calendar"
          open
          hideTrigger
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
        />
      )}

      {!isPast &&
        addOpen &&
        (addKind === "event" || addKind === "deadline") && (
          <CalendarCommitmentForm
            selectedDate={selectedDate}
            timezone={timezone}
            now={now}
            initialType={addKind}
            onCancel={closeForm}
            onSaved={handleSaved}
          />
        )}

      {!isPast && addOpen && addKind === null && (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Add another kind</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddKind("event")}
            className="h-12 justify-start rounded-xl"
          >
            Add event
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddKind("deadline")}
            className="h-12 justify-start rounded-xl"
          >
            Add standalone deadline
          </Button>
          <Button type="button" variant="ghost" onClick={closeForm}>
            Cancel
          </Button>
        </div>
      )}

      {!isPast && !addOpen && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              setOpenSwipeItemKey(null);
              setAddOpen(true);
              setAddKind("action");
            }}
            className="h-12 w-full rounded-xl text-base"
          >
            <Plus />
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpenSwipeItemKey(null);
              setAddOpen(true);
              setAddKind(null);
            }}
            className="h-10 w-full text-sm text-muted-foreground"
          >
            <MoreHorizontal />
            More
          </Button>
        </div>
      )}
    </section>
  );
}

function CalendarDaySection({
  title,
  items,
  actionPresentation,
  selectedDate,
  today,
  timezone,
  now,
  openSwipeItemKey,
  onOpenAction,
  onSwipeOpenChange,
  onSaved,
  readOnly,
}: {
  title: string;
  items: CalendarDayItem[];
  actionPresentation: "timed" | "untimed" | "due";
  selectedDate: string;
  today: string;
  timezone: string;
  now: Date;
  openSwipeItemKey: string | null;
  onOpenAction: () => void;
  onSwipeOpenChange: (itemKey: string, open: boolean) => void;
  onSaved: () => void;
  readOnly: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">
        {items.map((item) => {
          if (item.kind === "action") {
            const action = item.value;
            const itemKey = `action:${action.id}:${action.calendar_projection ?? "occurrence"}`;

            return (
              <CalendarActionRow
                key={itemKey}
                action={action}
                localDate={selectedDate}
                today={today}
                timezone={timezone}
                timed={actionPresentation === "timed"}
                due={actionPresentation === "due"}
                swipeItemKey={itemKey}
                swipeOpen={openSwipeItemKey === itemKey}
                onSwipeOpenChange={(open) => onSwipeOpenChange(itemKey, open)}
                onOpenWorkspace={onOpenAction}
              />
            );
          }

          const commitment = item.value;
          const itemKey = `commitment:${commitment.id}:${commitment.occurrence_date}`;
          return (
            <CommitmentRow
              key={itemKey}
              commitment={commitment}
              today={today}
              timezone={timezone}
              now={now}
              swipeItemKey={itemKey}
              swipeOpen={openSwipeItemKey === itemKey}
              onSwipeOpenChange={(open) =>
                onSwipeOpenChange(itemKey, open)
              }
              onSaved={onSaved}
              readOnly={readOnly}
            />
          );
        })}
      </div>
    </div>
  );
}

function CommitmentRow({
  commitment,
  today,
  timezone,
  now,
  swipeItemKey,
  swipeOpen,
  onSwipeOpenChange,
  onSaved,
  readOnly,
}: {
  commitment: CalendarCommitment;
  today: string;
  timezone: string;
  now: Date;
  swipeItemKey: string;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
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
    commitment.occurrence_date >= today &&
    commitment.status === "scheduled" &&
    !commitment.reconciliation_outcome;
  const canSwipeRemove =
    !readOnly &&
    commitment.status === "scheduled" &&
    !commitment.reconciliation_outcome &&
    (!recurringEvent || canSkipThisOccurrence);
  const [deletionPending, setDeletionPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  async function handleDelete() {
    if (deletionPending) return;

    if (!canSkipThisOccurrence) {
      setDeletionError(null);
      setDeleteConfirming(true);
      onSwipeOpenChange(false);
      return;
    }

    setDeletionPending(true);
    setDeletionError(null);
    const formData = new FormData();
    formData.set("commitmentId", commitment.id);
    formData.set("occurrenceDate", commitment.occurrence_date);

    try {
      const result = await skipCalendarEventOccurrenceAction(
        initialCalendarActionState,
        formData,
      );
      if (!result.saved) {
        setDeletionError(
          result.error ?? "Couldn’t skip this occurrence. Try again.",
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
      setDeletionError("Couldn’t skip this occurrence. Try again.");
      onSwipeOpenChange(false);
    } finally {
      setDeletionPending(false);
    }
  }

  return (
    <SwipeToRemove
      itemId={swipeItemKey}
      itemTitle={commitment.title}
      open={swipeOpen}
      onOpenChange={onSwipeOpenChange}
      onRemove={handleDelete}
      removalPending={deletionPending}
      removing={removing}
      enabled={canSwipeRemove}
      accessibilityContext="from Calendar"
      actionLabel={canSkipThisOccurrence ? "Skip this occurrence" : "Delete"}
      pendingLabel={canSkipThisOccurrence ? "Skipping…" : "Deleting…"}
    >
      <article className="min-w-0 rounded-2xl border border-border bg-card">
        <Link
          href={`/calendar/commitments/${commitment.id}?date=${commitment.occurrence_date}`}
          onClick={() => onSwipeOpenChange(false)}
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
        </Link>

        {deletionError && (
          <p role="alert" className="px-4 pb-3 text-xs text-destructive">
            {deletionError}
          </p>
        )}

        {deleteConfirming && (
          <div className="bg-card px-4 pb-4">
            <CalendarCommitmentDeleteControl
              commitment={commitment}
              confirming
              onConfirmingChange={setDeleteConfirming}
              onSaved={onSaved}
              showTrigger={false}
            />
          </div>
        )}
      </article>
    </SwipeToRemove>
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
