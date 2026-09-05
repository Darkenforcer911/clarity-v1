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
  type CalendarDailyAction,
} from "@/lib/clarity/calendar-daily-actions";
import { formatDuration } from "@/lib/clarity/duration";
import { SwipeToRemove } from "./swipe-to-remove";

export function CalendarActionRow({
  action,
  localDate,
  today,
  timezone,
  timed,
  due,
  swipeItemKey,
  swipeOpen,
  onSwipeOpenChange,
  onOpenWorkspace,
}: {
  action: CalendarDailyAction;
  localDate: string;
  today: string;
  timezone: string;
  timed: boolean;
  due: boolean;
  swipeItemKey: string;
  swipeOpen: boolean;
  onSwipeOpenChange: (open: boolean) => void;
  onOpenWorkspace: () => void;
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
      onClick={onOpenWorkspace}
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
      itemId={swipeItemKey}
      itemTitle={action.title}
      open={swipeOpen}
      onOpenChange={onSwipeOpenChange}
      onRemove={removeAction}
      removalPending={removalPending}
      removing={removing}
      enabled
      accessibilityContext="from Calendar"
      actionLabel={action.source_routine_id ? "Skip today" : "Remove today"}
      pendingLabel={action.source_routine_id ? "Skipping…" : "Removing…"}
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
