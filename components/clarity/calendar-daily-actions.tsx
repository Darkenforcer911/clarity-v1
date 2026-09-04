"use client";

import { CalendarClock, CheckCircle2, Circle, Clock3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  removeActionFromTodayInlineAction,
  removeActionOccurrenceInlineAction,
} from "@/app/(app)/today/action-workspace-actions";

import {
  formatCalendarActionOutcome,
  formatCalendarActionDue,
  formatCalendarActionTimeRange,
  partitionCalendarDailyActions,
  type CalendarDailyAction,
} from "@/lib/clarity/calendar-daily-actions";
import { formatDuration } from "@/lib/clarity/duration";
import { SwipeToRemove } from "./swipe-to-remove";

export function CalendarDailyActions({
  actions,
  localDate,
  today,
  timezone,
}: {
  actions: CalendarDailyAction[];
  localDate: string;
  today: string;
  timezone: string;
}) {
  const [swipedActionId, setSwipedActionId] = useState<string | null>(null);
  const { due, timed, untimed } = partitionCalendarDailyActions(actions);

  if (actions.length === 0) return null;

  return (
    <>
      <CalendarActionSection
        title="Scheduled actions"
        actions={timed}
        localDate={localDate}
        today={today}
        timezone={timezone}
        timed
        swipedActionId={swipedActionId}
        onSwipedActionChange={setSwipedActionId}
      />
      <CalendarActionSection
        title="Due"
        actions={due}
        localDate={localDate}
        today={today}
        timezone={timezone}
        due
        swipedActionId={swipedActionId}
        onSwipedActionChange={setSwipedActionId}
      />
      <CalendarActionSection
        title="Actions"
        actions={untimed}
        localDate={localDate}
        today={today}
        timezone={timezone}
        swipedActionId={swipedActionId}
        onSwipedActionChange={setSwipedActionId}
      />
    </>
  );
}

function CalendarActionSection({
  title,
  actions,
  localDate,
  today,
  timezone,
  timed = false,
  due = false,
  swipedActionId,
  onSwipedActionChange,
}: {
  title: string;
  actions: CalendarDailyAction[];
  localDate: string;
  today: string;
  timezone: string;
  timed?: boolean;
  due?: boolean;
  swipedActionId: string | null;
  onSwipedActionChange: (actionId: string | null) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">
        {actions.map((action) => (
          <CalendarActionRow
            key={action.id}
            action={action}
            localDate={localDate}
            today={today}
            timezone={timezone}
            timed={timed}
            due={due}
            swipeOpen={swipedActionId === action.id}
            onSwipeOpenChange={(open) =>
              onSwipedActionChange(open ? action.id : null)
            }
          />
        ))}
      </div>
    </section>
  );
}

function CalendarActionRow({
  action,
  localDate,
  today,
  timezone,
  timed,
  due,
  swipeOpen,
  onSwipeOpenChange,
}: {
  action: CalendarDailyAction;
  localDate: string;
  today: string;
  timezone: string;
  timed: boolean;
  due: boolean;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [removalPending, setRemovalPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const outcome = formatCalendarActionOutcome(action, timezone);
  const timing = timed
    ? formatCalendarActionTimeRange(action, timezone)
    : null;
  const dueTiming = due ? formatCalendarActionDue(action) : null;
  const removable =
    action.status === "active" ||
    (action.status === "proposed" && action.local_date >= today);
  const opensWorkspace =
    localDate >= today &&
    (action.status === "proposed" ||
      action.status === "active" ||
      action.status === "completed");
  const content = (
    <>
      {action.status === "completed" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
      ) : due ? (
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
      ) : timed ? (
        <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">
          {action.title}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {[dueTiming ?? timing, due ? null : formatDuration(action.estimated_minutes)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {outcome && (
          <span className="mt-1 block text-xs font-medium text-[var(--clarity-completed)]">
            {outcome}
          </span>
        )}
      </span>
    </>
  );

  const surface = opensWorkspace ? (
      <Link
        href={`/today/actions/${action.id}?from=calendar&date=${localDate}`}
        className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
  ) : (
    <article className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-border bg-card p-4">
      {content}
    </article>
  );

  if (!removable) return surface;

  async function removeAction() {
    if (removalPending) return;

    setRemovalPending(true);
    setRemovalError(null);
    const result =
      action.status === "active"
        ? await removeActionFromTodayInlineAction(action.id)
        : await removeActionOccurrenceInlineAction(action.id);

    if (!result.success) {
      setRemovalError(result.error ?? "Couldn’t remove this Action. Try again.");
      setRemovalPending(false);
      onSwipeOpenChange(false);
      return;
    }

    setRemoving(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 190;
    window.setTimeout(() => {
      onSwipeOpenChange(false);
      router.refresh();
    }, delay);
  }

  return (
    <SwipeToRemove
      itemId={action.id}
      itemTitle={action.title}
      open={swipeOpen}
      onOpenChange={onSwipeOpenChange}
      onRemove={removeAction}
      removalPending={removalPending}
      removing={removing}
      enabled
      accessibilityContext="from Calendar"
      actionLabel={
        action.local_date === today
          ? "Remove today"
          : action.source_routine_id
            ? "Remove occurrence"
            : "Remove"
      }
    >
      <div className="min-w-0">
        {surface}
        {removalError && (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            {removalError}
          </p>
        )}
      </div>
    </SwipeToRemove>
  );
}
