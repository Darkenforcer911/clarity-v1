"use client";

import {
  ArrowRight,
  Bookmark,
  Clock3,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";

import { startMyDayAction } from "@/app/(app)/today/actions";
import { decideBriefingContextAction } from "@/app/(app)/today/day-transition-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { NewDayBriefing as Briefing } from "@/lib/clarity/new-day-briefing";
import { formatWeekday } from "@/lib/clarity/date-time";
import { PendingButton } from "./pending-button";

export function NewDayBriefing({
  briefing,
  currentLocalDate,
}: {
  briefing: Briefing;
  currentLocalDate: string;
}) {
  const [context, setContext] = useState("");
  const [deferredUntilSleep, setDeferredUntilSleep] = useState(false);
  const currentDay = formatWeekday(currentLocalDate);
  const previousDay = formatWeekday(briefing.previousLocalDate);
  const deferKey = `clarity:late-night-deferred:${currentLocalDate}`;

  useEffect(() => {
    if (briefing.lateNight) {
      const frame = window.requestAnimationFrame(() => {
        setDeferredUntilSleep(
          window.sessionStorage.getItem(deferKey) === "true",
        );
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [briefing.lateNight, deferKey]);

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[var(--clarity-completed)]">
          {currentDay} briefing
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          Start with what is real.
        </h1>
        <p className="leading-7 text-muted-foreground">
          {previousDay}: {briefing.completedCount} completed ·{" "}
          {briefing.movedCount} moved · {briefing.droppedCount} dropped
        </p>
      </div>

      {briefing.carriedActions.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <RotateCcw className="size-4 text-[var(--clarity-completed)]" />
            Carried into today
          </div>
          <ul className="mt-3 space-y-2">
            {briefing.carriedActions.map((action) => (
              <li key={action.id} className="text-sm">
                {action.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.explanation && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            What changed
          </p>
          <p className="mt-3 text-sm leading-6">{briefing.explanation}</p>
        </div>
      )}

      {briefing.ongoingContextCandidate && (
        <BriefingContextPrompt
          dayRecordId={briefing.dayRecordId}
          label={briefing.ongoingContextCandidate.label}
          sourceText={briefing.ongoingContextCandidate.sourceText}
        />
      )}

      {briefing.lateNight && deferredUntilSleep ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-semibold">{currentDay} is still unshaped.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Come back after sleep when you&apos;re ready to shape the day.
          </p>
        </div>
      ) : (
        <form action={startMyDayAction} className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Anything changed or missing?
            </span>
            <Textarea
              name="briefingContext"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              maxLength={2000}
              placeholder="Optional context for today."
            />
          </label>

          {briefing.lateNight && (
            <p className="font-semibold">
              Are you starting {currentDay} now?
            </p>
          )}

          <PendingButton
            type="submit"
            size="lg"
            pendingLabel={`Opening Shape ${currentDay}…`}
            className="h-12 w-full rounded-xl text-base"
          >
            {briefing.lateNight
              ? `Start ${currentDay} now`
              : `Shape ${currentDay}`}
            <ArrowRight />
          </PendingButton>

          {briefing.lateNight && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full rounded-xl"
              onClick={() => {
                window.sessionStorage.setItem(deferKey, "true");
                setDeferredUntilSleep(true);
              }}
            >
              I&apos;ll start after sleep
            </Button>
          )}
        </form>
      )}
    </section>
  );
}

function BriefingContextPrompt({
  dayRecordId,
  label,
  sourceText,
}: {
  dayRecordId: string;
  label: string;
  sourceText: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="font-semibold">
        You mentioned {sourceText.toLowerCase()}. Should Clarity remember{" "}
        {label} as something ongoing?
      </p>
      <div className="mt-4 grid gap-2">
        <ContextDecision
          dayRecordId={dayRecordId}
          decision="remembered"
          icon={<Bookmark />}
        >
          Remember it
        </ContextDecision>
        <ContextDecision dayRecordId={dayRecordId} decision="once">
          Just this once
        </ContextDecision>
        <ContextDecision
          dayRecordId={dayRecordId}
          decision="dismissed"
          icon={<Clock3 />}
        >
          Not now
        </ContextDecision>
      </div>
    </section>
  );
}

function ContextDecision({
  dayRecordId,
  decision,
  icon,
  children,
}: {
  dayRecordId: string;
  decision: "remembered" | "once" | "dismissed";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <form action={decideBriefingContextAction}>
      <input type="hidden" name="dayRecordId" value={dayRecordId} />
      <input type="hidden" name="decision" value={decision} />
      <PendingButton
        type="submit"
        variant={decision === "remembered" ? "outline" : "ghost"}
        pendingLabel="Saving…"
        className="h-10 w-full rounded-xl"
      >
        {icon}
        {children}
      </PendingButton>
    </form>
  );
}
