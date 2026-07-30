"use client";

import { Clock3, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  heading = "Correct completion time",
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
    <section className={embedded ? "space-y-4" : "rounded-2xl bg-card p-4"}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{heading}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label="Close completion time correction"
          className="rounded-xl"
        >
          <X />
        </Button>
      </div>

      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">
            {allowedDateLabel
              ? `Exact local time on ${allowedDateLabel}`
              : "Completion time"}
          </span>
          <Input
            type="time"
            value={completionTime}
            onChange={(event) => {
              setCompletionTime(event.currentTarget.value);
              setTimeUnknown(false);
              setError(null);
              setFieldError(null);
            }}
            required={!timeUnknown}
            disabled={timeUnknown || saving}
            className="h-11 rounded-xl"
          />
          {fieldError && (
            <span className="block text-sm text-[var(--clarity-completed)]">
              {fieldError}
            </span>
          )}
        </label>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-sm font-medium">
          <input
            type="checkbox"
            checked={timeUnknown}
            disabled={saving}
            onChange={(event) => {
              setTimeUnknown(event.currentTarget.checked);
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

        <div className="grid grid-cols-2 gap-2">
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
            <Clock3 />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}
