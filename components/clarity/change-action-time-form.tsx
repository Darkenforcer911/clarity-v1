"use client";

import { Clock3, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { changeActionTimeAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import type { DailyAction } from "@/lib/clarity/daily-loop-queries";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { DurationFields, OptionalActionTimeField } from "./action-fields";
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
  const [state, formAction] = useActionState(
    changeActionTimeAction,
    initialDailyLoopActionState,
  );
  const handledSuccess = useRef(false);
  const [timeExpanded, setTimeExpanded] = useState(false);

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
        <OptionalActionTimeField
          initialScheduledTime={scheduledTimeInput}
          error={state.fieldErrors?.scheduledTime?.[0]}
          expanded={
            timeExpanded || Boolean(state.fieldErrors?.scheduledTime?.[0])
          }
          onExpandedChange={setTimeExpanded}
        />

        <DurationFields
          initialMinutes={action.estimated_minutes}
          error={state.fieldErrors?.estimatedMinutes?.[0]}
        />

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
