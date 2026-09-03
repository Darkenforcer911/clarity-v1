"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import {
  formatCalendarOutcomeStatus,
  formatCommitmentRecurrence,
  getCommitmentMeta,
  getCommitmentTimingState,
  sortCalendarCommitments,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { orderLaterTodayItems } from "@/lib/clarity/today-display-order";
import { TimedDayItemSummary } from "./timed-day-item-summary";

export function DailyCommitments({
  heading,
  commitments,
  actions = [],
  renderAction,
  needsOutcome = false,
  timezone,
  now,
}: {
  heading: string;
  commitments: CalendarCommitment[];
  actions?: DailyAction[];
  renderAction?: (action: DailyAction) => ReactNode;
  needsOutcome?: boolean;
  timezone: string;
  now: Date;
}) {
  const items = orderLaterTodayItems({
    actions,
    commitments: sortCalendarCommitments(commitments),
    timezone,
  });

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {heading}
      </h2>
      <div className="space-y-2">
        {items.map((item) =>
          item.kind === "action" ? (
            <Fragment key={`action-${item.value.id}`}>
              {renderAction?.(item.value)}
            </Fragment>
          ) : (
            <DailyCommitmentCard
              key={`commitment-${item.value.id}`}
              commitment={item.value}
              timezone={timezone}
              now={now}
              needsOutcome={needsOutcome}
            />
          ),
        )}
      </div>
    </section>
  );
}

export function DailyCommitmentCard({
  commitment,
  timezone,
  now,
  needsOutcome = false,
}: {
  commitment: CalendarCommitment;
  timezone: string;
  now: Date;
  needsOutcome?: boolean;
}) {
  const timing = getCommitmentTimingState(commitment, timezone, now);
  const recurrence = formatCommitmentRecurrence(commitment);
  const status = commitment.reconciliation_outcome
    ? formatCalendarOutcomeStatus(commitment, timezone)
    : needsOutcome && (timing === "time_passed" || timing === "overdue")
      ? "Needs outcome"
      : timing === "time_passed"
        ? "Time passed"
        : timing === "overdue"
          ? "Overdue"
        : timing !== "scheduled"
          ? timing[0].toUpperCase() + timing.slice(1)
          : null;

  return (
    <Link
      href={`/calendar?date=${commitment.occurrence_date}&commitment=${commitment.id}`}
      className="flex min-h-14 min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TimedDayItemSummary
        title={commitment.title}
        meta={[getCommitmentMeta(commitment), recurrence]
          .filter(Boolean)
          .join(" · ")}
        status={status}
      />
    </Link>
  );
}
