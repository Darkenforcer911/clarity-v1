"use client";

import { Clock3, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { changeActionTimeAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { PendingButton } from "./pending-button";

export function ChangeActionTimeForm({
  action,
  scheduledTimeInput,
  onClose,
  onSaved,
}: {
  action: DailyAction;
  scheduledTimeInput: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [timing, setTiming] = useState(
    action.action_type === "fixed" ? "fixed" : "flexible",
  );
  const [state, formAction] = useActionState(
    changeActionTimeAction,
    initialDailyLoopActionState,
  );
  const handledSuccess = useRef(false);

  useEffect(() => {
    if (state.success && !handledSuccess.current) {
      handledSuccess.current = true;
      onSaved();
    }
  }, [onSaved, state.success]);

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Change time</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close Change time"
          className="rounded-xl"
        >
          <X />
        </Button>
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="actionId" value={action.id} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">When?</legend>
          <div className="grid grid-cols-2 gap-2">
            <TimingChoice
              checked={timing === "flexible"}
              label="Anytime today"
              value="flexible"
              onChange={setTiming}
            />
            <TimingChoice
              checked={timing === "fixed"}
              label="At a specific time"
              value="fixed"
              onChange={setTiming}
            />
          </div>
        </fieldset>

        {timing === "fixed" && (
          <label className="block space-y-2">
            <span className="block text-sm font-medium">Specific time</span>
            <Input
              name="scheduledTime"
              type="time"
              defaultValue={scheduledTimeInput}
              required
              className="h-12 rounded-xl"
            />
            {state.fieldErrors?.scheduledTime?.[0] && (
              <span className="block text-sm text-[var(--clarity-completed)]">
                {state.fieldErrors.scheduledTime[0]}
              </span>
            )}
          </label>
        )}

        <label className="block space-y-2">
          <span className="block text-sm font-medium">Duration</span>
          <Input
            name="estimatedMinutes"
            type="number"
            min={1}
            max={1440}
            inputMode="numeric"
            defaultValue={action.estimated_minutes}
            required
            className="h-12 rounded-xl"
          />
          {state.fieldErrors?.estimatedMinutes?.[0] && (
            <span className="block text-sm text-[var(--clarity-completed)]">
              {state.fieldErrors.estimatedMinutes[0]}
            </span>
          )}
        </label>

        {state.error && (
          <p
            role="alert"
            className="rounded-xl bg-secondary px-4 py-3 text-sm"
          >
            {state.error}
          </p>
        )}

        <PendingButton
          type="submit"
          pendingLabel="Saving…"
          className="h-12 w-full rounded-xl text-base"
        >
          <Clock3 />
          Save changes
        </PendingButton>
      </form>
    </section>
  );
}

function TimingChoice({
  checked,
  label,
  value,
  onChange,
}: {
  checked: boolean;
  label: string;
  value: "fixed" | "flexible";
  onChange: (value: "fixed" | "flexible") => void;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold ${
        checked
          ? "border-[var(--clarity-completed)] bg-secondary"
          : "border-border text-muted-foreground"
      }`}
    >
      <input
        type="radio"
        name="actionType"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}
