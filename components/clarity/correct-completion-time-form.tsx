"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { correctCompletionTimeAction } from "@/app/(app)/today/action-workspace-actions";
import { Button } from "@/components/ui/button";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import {
  CompletionTimeEditor,
  type CompletionTimeDraft,
} from "./completion-time-editor";

export function CorrectCompletionTimeForm({
  actionId,
  completionSummary,
  completionTimeInput,
  completionTimeUnknown,
  editable,
}: {
  actionId: string;
  completionSummary: string;
  completionTimeInput: string;
  completionTimeUnknown: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  async function save(draft: CompletionTimeDraft) {
    const formData = new FormData();
    formData.set("actionId", actionId);
    formData.set("completionTime", draft.completionTime);

    if (draft.timeUnknown) {
      formData.set("timeUnknown", "on");
    }

    const state = await correctCompletionTimeAction(
      initialDailyLoopActionState,
      formData,
    );
    const fieldError = state.fieldErrors?.completionTime?.[0];

    if (state.success) {
      setEditing(false);
      router.refresh();
      return null;
    }

    return fieldError
      ? { fieldError }
      : {
          error:
            state.error ??
            "Couldn’t update the completion time. Try again.",
        };
  }

  if (!editing) {
    return (
      <div
        data-completion-time-summary
        className="min-w-0 text-xs text-muted-foreground"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-1">
          <span>{completionSummary}</span>
          {editable && (
            <>
              <span aria-hidden="true">·</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-7 shrink-0 rounded-md px-1.5 text-xs text-muted-foreground"
              >
                Edit time
              </Button>
            </>
          )}
        </div>
        {completionTimeUnknown && <p className="mt-1">Time not recorded</p>}
      </div>
    );
  }

  return (
    <CompletionTimeEditor
      initialCompletionTime={completionTimeInput}
      initialTimeUnknown={completionTimeUnknown}
      onSave={save}
      onCancel={() => setEditing(false)}
    />
  );
}
