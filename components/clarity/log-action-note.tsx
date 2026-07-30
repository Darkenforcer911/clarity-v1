"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { logActionUpdateAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import { PendingButton } from "./pending-button";

export function LogActionUpdate({
  actionId,
  onClose,
  onSaved,
}: {
  actionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useActionState(
    logActionUpdateAction,
    initialDailyLoopActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const handledSuccess = useRef(false);

  useEffect(() => {
    if (state.success && !handledSuccess.current) {
      handledSuccess.current = true;
      formRef.current?.reset();
      onSaved();
    }
  }, [onSaved, state.success]);

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Log update</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close log update"
          className="rounded-xl"
        >
          <X />
        </Button>
      </div>
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="actionId" value={actionId} />
        <label className="block text-sm font-medium" htmlFor="action-update">
          What happened or what should Clarity remember?
        </label>
        <Textarea
          id="action-update"
          name="note"
          maxLength={2000}
          required
        />
        {state.fieldErrors?.note?.[0] && (
          <p className="text-sm text-[var(--clarity-completed)]">
            {state.fieldErrors.note[0]}
          </p>
        )}
        {state.error && (
          <p
            role="alert"
            className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm"
          >
            {state.error}
          </p>
        )}
        <PendingButton
          type="submit"
          variant="outline"
          pendingLabel="Saving…"
          className="h-11 w-full rounded-xl"
        >
          <Plus />
          Save update
        </PendingButton>
      </form>
    </section>
  );
}
