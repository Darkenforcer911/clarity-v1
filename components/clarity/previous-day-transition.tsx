"use client";

import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { useActionState } from "react";

import { recordPreviousDayAction } from "@/app/(app)/today/day-transition-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PreviousDayTransition as Transition } from "@/lib/clarity/daily-loop-queries";
import { initialDayTransitionActionState } from "@/lib/clarity/day-transition-state";
import {
  formatFullLocalDate,
  formatWeekday,
} from "@/lib/clarity/date-time";
import { PendingButton } from "./pending-button";

export function PreviousDayTransition({
  transition,
}: {
  transition: Transition;
}) {
  if (transition.kind === "wrap_up") {
    const completed = transition.actions.filter(
      (action) => action.approved_at && action.status === "completed",
    ).length;
    const unfinished = transition.actions.filter(
      (action) =>
        action.approved_at &&
        ["active", "rescheduled"].includes(action.status),
    ).length;
    const day = formatWeekday(transition.localDate);

    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <History className="mb-5 size-7 text-[var(--clarity-completed)]" />
        <h1 className="text-2xl font-semibold tracking-[-0.035em]">
          {day} needs a quick wrap-up.
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          You completed {completed} {completed === 1 ? "action" : "actions"}.{" "}
          {unfinished} {unfinished === 1 ? "was" : "were"} left unfinished.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-7 h-12 w-full rounded-xl text-base"
        >
          <Link href="/today/catch-up">
            Wrap up {day}
            <ArrowRight />
          </Link>
        </Button>
      </section>
    );
  }

  return <UnrecordedDay transition={transition} />;
}

function UnrecordedDay({
  transition,
}: {
  transition: Extract<Transition, { kind: "unrecorded" }>;
}) {
  const [state, formAction] = useActionState(
    recordPreviousDayAction,
    initialDayTransitionActionState,
  );
  const day = formatWeekday(transition.localDate);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">
        {formatFullLocalDate(transition.localDate)}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
        {day} wasn&apos;t recorded.
      </h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        Want to tell Clarity what happened?
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">What happened {day}?</span>
          <Textarea
            name="explanation"
            defaultValue={state.explanation}
            maxLength={5000}
            placeholder="A short note about the day."
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

        <div className="grid gap-2">
          <PendingButton
            type="submit"
            name="intent"
            value="record"
            pendingLabel="Recording…"
            className="h-12 rounded-xl text-base"
          >
            Record {day}
          </PendingButton>
          <PendingButton
            type="submit"
            name="intent"
            value="skip"
            pendingLabel="Skipping…"
            variant="ghost"
            className="h-11 rounded-xl"
          >
            Skip {day}
          </PendingButton>
        </div>
      </form>
    </section>
  );
}
