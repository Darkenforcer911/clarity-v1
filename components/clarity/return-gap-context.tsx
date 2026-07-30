"use client";

import { useActionState, useState } from "react";

import { recordReturnGapAction } from "@/app/(app)/today/day-transition-actions";
import { Textarea } from "@/components/ui/textarea";
import { initialDayTransitionActionState } from "@/lib/clarity/day-transition-state";
import {
  addLocalDays,
  formatFullLocalDate,
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
  const oneDay = gap.gapStartDate === gapEndDate;
  const rangeLabel = oneDay
    ? startDay
    : `${startDay}–${endDay}`;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {oneDay
            ? formatFullLocalDate(gap.gapStartDate)
            : rangeLabel}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Anything important happen {rangeLabel}?
        </h1>
        <p className="leading-6 text-muted-foreground">
          {oneDay
            ? `Add anything from ${startDay} that could affect what Clarity suggests for ${currentDay}.`
            : `Add anything from these days that could affect what Clarity suggests for ${currentDay}.`}
        </p>
      </header>

      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="sr-only">
            Meaningful context from {rangeLabel}
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
