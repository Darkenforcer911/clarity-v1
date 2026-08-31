import { CheckCircle2, Circle, Clock3 } from "lucide-react";
import Link from "next/link";

import {
  formatCalendarActionOutcome,
  formatCalendarActionTimeRange,
  partitionCalendarDailyActions,
  type CalendarDailyAction,
} from "@/lib/clarity/calendar-daily-actions";
import { formatDuration } from "@/lib/clarity/duration";

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
  const { timed, untimed } = partitionCalendarDailyActions(actions);

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
      />
      <CalendarActionSection
        title="Actions"
        actions={untimed}
        localDate={localDate}
        today={today}
        timezone={timezone}
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
}: {
  title: string;
  actions: CalendarDailyAction[];
  localDate: string;
  today: string;
  timezone: string;
  timed?: boolean;
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
}: {
  action: CalendarDailyAction;
  localDate: string;
  today: string;
  timezone: string;
  timed: boolean;
}) {
  const outcome = formatCalendarActionOutcome(action, timezone);
  const timing = timed
    ? formatCalendarActionTimeRange(action, timezone)
    : null;
  const content = (
    <>
      {action.status === "completed" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
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
          {[timing, formatDuration(action.estimated_minutes)]
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

  if (
    localDate === today &&
    (action.status === "active" || action.status === "completed")
  ) {
    return (
      <Link
        href={`/today/actions/${action.id}?from=calendar&date=${localDate}`}
        className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="flex min-h-14 w-full items-start gap-3 rounded-2xl border border-border bg-card p-4">
      {content}
    </article>
  );
}
