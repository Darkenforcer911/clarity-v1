"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCommitmentTime } from "@/lib/clarity/calendar-rules";
import { TimeSelector } from "./time-selector";

export type CompletionTimeDraft = {
  completionTime: string;
  timeUnknown: boolean;
};

export type CompletionTimeSaveError = {
  error?: string;
  fieldError?: string;
};

export function CompletionTimeEditor({
  initialCompletionTime,
  initialTimeUnknown,
  allowedDateLabel,
  heading = "Completion time",
  embedded = false,
  onSave,
  onCancel,
}: {
  initialCompletionTime: string;
  initialTimeUnknown: boolean;
  allowedDateLabel?: string;
  heading?: string;
  embedded?: boolean;
  onSave: (
    draft: CompletionTimeDraft,
  ) => Promise<CompletionTimeSaveError | null>;
  onCancel: () => void;
}) {
  const [completionTime, setCompletionTime] = useState(
    initialCompletionTime,
  );
  const [timeUnknown, setTimeUnknown] = useState(initialTimeUnknown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setFieldError(null);

    if (!timeUnknown && !completionTime) {
      setFieldError(
        "Choose a completion time or select Time not recorded.",
      );
      return;
    }

    setSaving(true);

    try {
      const result = await onSave({ completionTime, timeUnknown });

      if (result) {
        setError(result.error ?? null);
        setFieldError(result.fieldError ?? null);
      }
    } catch {
      setError("Couldn’t update the completion time. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-completion-time-editor
      className={`w-full min-w-0 max-w-full space-y-3 ${embedded ? "" : "rounded-xl bg-secondary p-3"}`}
    >
      <p className="text-sm font-semibold">
        {allowedDateLabel ? `Completion time on ${allowedDateLabel}` : heading}
      </p>

      <div className="min-w-0 space-y-3">
        <TimeSelector
          label="Completion time"
          value={timeUnknown ? "" : completionTime}
          summary={
            timeUnknown
              ? "Select time"
              : formatCommitmentTime(completionTime) ?? "Select time"
          }
          onChange={(value) => {
            setCompletionTime(value);
            setTimeUnknown(false);
            setError(null);
            setFieldError(null);
          }}
          error={fieldError ?? undefined}
        />

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-sm font-medium">
          <input
            type="checkbox"
            checked={timeUnknown}
            disabled={saving}
            onChange={(event) => {
              setTimeUnknown(event.currentTarget.checked);
              if (event.currentTarget.checked) setCompletionTime("");
              setError(null);
              setFieldError(null);
            }}
            className="size-5 rounded border border-border accent-primary"
          />
          Time not recorded
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-secondary px-4 py-3 text-sm"
          >
            {error}
          </p>
        )}

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
            className="h-11 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-11 rounded-xl"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}
