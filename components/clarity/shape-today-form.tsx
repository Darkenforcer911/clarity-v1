"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";

import { buildPlanAction } from "@/app/(app)/today/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { PendingButton } from "./pending-button";

export function ShapeTodayForm({
  defaults,
  initialContext = "",
}: {
  defaults: { wokeAt: string; aimingToSleepAt: string };
  initialContext?: string;
}) {
  const [state, formAction] = useActionState(
    buildPlanAction,
    initialDailyLoopActionState,
  );
  const [nothingElseToday, setNothingElseToday] = useState(false);
  const [context, setContext] = useState(initialContext);
  const [wokeAt, setWokeAt] = useState(defaults.wokeAt);
  const [aimingToSleepAt, setAimingToSleepAt] = useState(
    defaults.aimingToSleepAt,
  );
  const timesValid =
    Boolean(wokeAt) &&
    Boolean(aimingToSleepAt) &&
    wokeAt !== aimingToSleepAt;
  const canBuild =
    timesValid && (nothingElseToday || context.trim().length > 0);

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wokeAt">Woke at</Label>
          <Input
            id="wokeAt"
            name="wokeAt"
            type="time"
            value={wokeAt}
            onChange={(event) => setWokeAt(event.target.value)}
            required
            className="h-12 rounded-xl"
          />
          {state.fieldErrors?.wokeAt?.[0] && (
            <p className="text-sm text-[var(--clarity-completed)]">
              {state.fieldErrors.wokeAt[0]}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="aimingToSleepAt">Aiming to sleep</Label>
          <Input
            id="aimingToSleepAt"
            name="aimingToSleepAt"
            type="time"
            value={aimingToSleepAt}
            onChange={(event) => setAimingToSleepAt(event.target.value)}
            required
            className="h-12 rounded-xl"
          />
          {state.fieldErrors?.aimingToSleepAt?.[0] && (
            <p className="text-sm text-[var(--clarity-completed)]">
              {state.fieldErrors.aimingToSleepAt[0]}
            </p>
          )}
          {wokeAt && aimingToSleepAt && wokeAt === aimingToSleepAt && (
            <p className="text-sm text-[var(--clarity-completed)]">
              Sleep time needs to be after wake time.
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Use your expected sleep time, even if it is after midnight.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Label htmlFor="contextForToday">
          Anything Clarity should account for today?
        </Label>
        <Textarea
          id="contextForToday"
          name="contextForToday"
          value={context}
          placeholder="Appointments, energy, commitments, or anything else that matters."
          onChange={(event) => {
            setContext(event.target.value);
            if (event.target.value && nothingElseToday) {
              setNothingElseToday(false);
            }
          }}
        />
        {state.fieldErrors?.contextForToday?.[0] && (
          <p className="text-sm text-[var(--clarity-completed)]">
            {state.fieldErrors.contextForToday[0]}
          </p>
        )}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <Checkbox
            id="nothingElseToday"
            name="nothingElseToday"
            checked={nothingElseToday}
            onCheckedChange={(checked) => {
              const nextChecked = checked === true;
              setNothingElseToday(nextChecked);
              if (nextChecked) {
                setContext("");
              }
            }}
          />
          <Label htmlFor="nothingElseToday" className="cursor-pointer">
            Nothing else today
          </Label>
        </div>
      </div>

      {state.error && (
        <p
          className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <PendingButton
        type="submit"
        size="lg"
        disabled={!canBuild}
        pendingLabel="Building your plan…"
        className="h-12 w-full rounded-xl text-base"
      >
        <Sparkles />
        Build my plan
      </PendingButton>
    </form>
  );
}
