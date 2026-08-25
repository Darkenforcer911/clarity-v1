"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";

import {
  formatCalendarOutcomeStatus,
  formatCommitmentRecurrence,
  getCommitmentMeta,
  getCommitmentTimingState,
  sortCalendarCommitments,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";

export function DailyCommitments({
  heading,
  commitments,
  timezone,
  now,
}: {
  heading: string;
  commitments: CalendarCommitment[];
  timezone: string;
  now: Date;
}) {
  if (commitments.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {heading}
      </h2>
      <div className="space-y-2">
        {sortCalendarCommitments(commitments).map((commitment) => {
          const timing = getCommitmentTimingState(commitment, timezone, now);
          const recurrence = formatCommitmentRecurrence(commitment);
          const status =
            commitment.reconciliation_outcome
              ? formatCalendarOutcomeStatus(commitment, timezone)
              : timing === "time_passed"
                ? "Time passed"
                : timing === "overdue"
                  ? "Overdue"
                  : timing !== "scheduled"
                    ? timing[0].toUpperCase() + timing.slice(1)
                    : null;

          return (
            <Link
              key={commitment.id}
              href={`/calendar?date=${commitment.occurrence_date}&commitment=${commitment.id}`}
              className="flex min-h-14 min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-[var(--clarity-completed)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">
                  {commitment.title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {[getCommitmentMeta(commitment), recurrence]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {status && (
                  <span className="mt-1 block text-xs font-medium text-[var(--clarity-completed)]">
                    {status}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
