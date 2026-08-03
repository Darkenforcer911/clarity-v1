"use client";

import { useActionState, useState } from "react";

import { recordReturnGapAction } from "@/app/(app)/today/day-transition-actions";
import { Textarea } from "@/components/ui/textarea";
import { initialDayTransitionActionState } from "@/lib/clarity/day-transition-state";
import {
  addLocalDays,
  formatWeekday,
} from "@/lib/clarity/date-time";
import type { PendingReturnGap } from "@/lib/clarity/daily-loop-queries";
import { PendingButton } from "./pending-button";
import { useCurrentLocalDate } from "./use-current-local-date";

export function ReturnGapContext({
  gap,
  timezone,
  currentLocalDate,
}: {
  gap: PendingReturnGap;
  timezone: string;
  currentLocalDate: string;
}) {
  const [state, formAction] = useActionState(
    recordReturnGapAction,
    initialDayTransitionActionState,
  );
  const [context, setContext] = useState("");
  const liveCurrentLocalDate = useCurrentLocalDate(
    timezone,
    currentLocalDate,
  );
  const liveGapEndDate = addLocalDays(liveCurrentLocalDate, -1);
  const gapEndDate =
    liveGapEndDate > gap.gapEndDate
      ? liveGapEndDate
      : gap.gapEndDate;
  const startDay = formatWeekday(gap.gapStartDate);
  const endDay = formatWeekday(gapEndDate);
  const currentDay = formatWeekday(liveCurrentLocalDate);
  const missedDayCount = countInclusiveDays(
    gap.gapStartDate,
    gapEndDate,
  );
  const oneDay = missedDayCount === 1;
  const longAbsence = missedDayCount > 7;
  const weekdayRange = `${startDay}–${endDay}`;
  const metadata = oneDay
    ? formatGapDate(gap.gapStartDate, true, true)
    : formatGapDateRange(
        gap.gapStartDate,
        gapEndDate,
        !longAbsence,
      );
  const heading = oneDay
    ? `Anything important happen ${startDay}?`
    : longAbsence
      ? "Anything important happen while you were away?"
      : `Anything important happen ${weekdayRange}?`;
  const supportingCopy = oneDay
    ? `Add anything from ${startDay} that could affect what Clarity suggests for ${currentDay}.`
    : longAbsence
      ? "Add anything from this period that could affect what Clarity suggests next."
      : `Add anything from these days that could affect what Clarity suggests for ${currentDay}.`;
  const periodDescription = oneDay
    ? startDay
    : longAbsence
      ? metadata
      : weekdayRange;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {metadata}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          {heading}
        </h1>
        <p className="leading-6 text-muted-foreground">
          {supportingCopy}
        </p>
      </header>

      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="sr-only">
            Meaningful context from {periodDescription}
          </span>
          <Textarea
            name="contextSummary"
            value={context}
            onChange={(event) => setContext(event.currentTarget.value)}
            maxLength={2000}
            placeholder="Closed a client, felt sick, barely slept, received a new deadline, or made progress on something important."
            className="min-h-32 rounded-xl"
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="rounded-xl bg-secondary px-4 py-3 text-sm"
          >
            {state.error}
          </p>
        )}

        <div className="space-y-2">
          <PendingButton
            type="submit"
            name="intent"
            value="context"
            disabled={!context.trim()}
            pendingLabel="Saving context…"
            className="h-12 w-full rounded-xl text-base"
          >
            Continue to {currentDay}
          </PendingButton>
          <PendingButton
            type="submit"
            name="intent"
            value="nothing-important"
            variant="ghost"
            pendingLabel="Continuing…"
            className="h-11 w-full rounded-xl"
          >
            Nothing important happened
          </PendingButton>
        </div>
      </form>
    </section>
  );
}

function countInclusiveDays(startDate: string, endDate: string) {
  return Math.floor(
    (parseLocalDate(endDate).getTime() -
      parseLocalDate(startDate).getTime()) /
      86_400_000,
  ) + 1;
}

function formatGapDateRange(
  startDate: string,
  endDate: string,
  includeWeekday: boolean,
) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = formatGapDate(
    startDate,
    includeWeekday,
    !sameYear,
  );
  const endLabel = formatGapDate(endDate, includeWeekday, true);

  return `${startLabel}–${endLabel}`;
}

function formatGapDate(
  localDate: string,
  includeWeekday: boolean,
  includeYear: boolean,
) {
  const date = parseLocalDate(localDate);
  const dateLabel = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(date);

  return includeWeekday
    ? `${formatWeekday(localDate)} ${dateLabel}`
    : dateLabel;
}

function parseLocalDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
