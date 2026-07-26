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

export function ShapeTodayForm() {
  const [state, formAction] = useActionState(
    buildPlanAction,
    initialDailyLoopActionState,
  );
  const [nothingElseToday, setNothingElseToday] = useState(false);
  const [context, setContext] = useState("");

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wokeAt">Woke at</Label>
          <Input
            id="wokeAt"
            name="wokeAt"
            type="time"
            required
            className="h-12 rounded-xl bg-[#0c2b62]/90"
          />
          {state.fieldErrors?.wokeAt?.[0] && (
            <p className="text-sm text-red-700">
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
            required
            className="h-12 rounded-xl bg-[#0c2b62]/90"
          />
          {state.fieldErrors?.aimingToSleepAt?.[0] && (
            <p className="text-sm text-red-700">
              {state.fieldErrors.aimingToSleepAt[0]}
            </p>
          )}
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
          disabled={nothingElseToday}
          placeholder="Appointments, energy, commitments, or anything else that matters."
          onChange={(event) => setContext(event.target.value)}
        />
        {state.fieldErrors?.contextForToday?.[0] && (
          <p className="text-sm text-red-700">
            {state.fieldErrors.contextForToday[0]}
          </p>
        )}
        <div className="flex items-center gap-3 rounded-xl border border-sky-200/20 bg-[#0c2b62]/90 px-4 py-3">
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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <PendingButton
        type="submit"
        size="lg"
        pendingLabel="Building your plan…"
        className="h-12 w-full rounded-xl bg-[#148bff] text-base hover:bg-[#0877e0]"
      >
        <Sparkles />
        Build my plan
      </PendingButton>
    </form>
  );
}
