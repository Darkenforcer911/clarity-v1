"use client";

import { correctCompletionTimeAction } from "@/app/(app)/today/action-workspace-actions";
import { initialDailyLoopActionState } from "@/lib/clarity/action-state";
import {
  CompletionTimeEditor,
  type CompletionTimeDraft,
} from "./completion-time-editor";

export function CorrectCompletionTimeForm({
  actionId,
  completionTimeInput,
  completionTimeUnknown,
  onClose,
  onSaved,
}: {
  actionId: string;
  completionTimeInput: string;
  completionTimeUnknown: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
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
      onSaved();
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

  return (
    <CompletionTimeEditor
      initialCompletionTime={completionTimeInput}
      initialTimeUnknown={completionTimeUnknown}
      onSave={save}
      onCancel={onClose}
    />
  );
}
