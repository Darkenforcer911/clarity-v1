"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatCalendarOutcomeStatus,
  formatCommitmentRecurrence,
  getCommitmentMeta,
  type CalendarCommitment,
} from "@/lib/clarity/calendar-commitments";
import { formatFullLocalDate } from "@/lib/clarity/date-time";
import { CalendarCommitmentForm } from "./calendar-commitment-form";
import { CalendarOccurrenceWorkspace } from "./calendar-occurrence-workspace";

export function CalendarCommitmentDetail({
  commitment,
  today,
  timezone,
  initialNow,
}: {
  commitment: CalendarCommitment;
  today: string;
  timezone: string;
  initialNow: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const calendarHref = `/calendar?date=${commitment.occurrence_date}`;

  if (editing) {
    return (
      <CalendarCommitmentForm
        selectedDate={commitment.occurrence_date}
        commitment={commitment}
        timezone={timezone}
        now={new Date(initialNow)}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  const recurrence = formatCommitmentRecurrence(commitment);
  const status = commitment.reconciliation_outcome
    ? formatCalendarOutcomeStatus(commitment, timezone)
    : null;

  return (
    <section className="space-y-6">
      <Button
        asChild
        variant="ghost"
        className="-ml-3 h-10 rounded-xl text-muted-foreground"
      >
        <Link href={calendarHref}>
          <ArrowLeft />
          Back to Calendar
        </Link>
      </Button>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">
          {commitment.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[
            formatFullLocalDate(commitment.occurrence_date),
            getCommitmentMeta(commitment),
            recurrence,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {status && (
          <p className="text-xs font-medium text-[var(--clarity-completed)]">
            {status}
          </p>
        )}
      </div>

      <CalendarOccurrenceWorkspace
        commitment={commitment}
        today={today}
        timezone={timezone}
        now={new Date(initialNow)}
        readOnly={commitment.occurrence_date < today}
        contained={false}
        skipReturnDate={commitment.occurrence_date}
        onEdit={() => setEditing(true)}
        onSaved={() => router.refresh()}
        onRemoved={() => {
          router.push(calendarHref);
          router.refresh();
        }}
      />
    </section>
  );
}
