"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialHistoricalCompletionTime } from "@/lib/clarity/historical-completion-time";

import { ClarityFormHeader } from "./clarity-form-header";
import { TimeSelector } from "./time-selector";
import { TimeSpentField } from "./time-spent-field";

export type RecapCompletedItem = {
  id: string;
  title: string;
  completionTime: string;
  actualMinutes: number | null;
};

export function RecapCompletedItemForm({
  initialItem,
  onSave,
  onCancel,
  embedded = false,
  submitting = false,
  submitLabel,
}: {
  initialItem?: RecapCompletedItem;
  onSave: (item: RecapCompletedItem) => void;
  onCancel: () => void;
  embedded?: boolean;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [completionTime, setCompletionTime] = useState(() =>
    initialHistoricalCompletionTime({
      completed: true,
      existingCompletionTime: initialItem?.completionTime,
    }),
  );
  const [actualMinutes, setActualMinutes] = useState(
    initialItem?.actualMinutes?.toString() ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const normalizedTitle = title.trim();
    const normalizedActualMinutes = actualMinutes
      ? Number(actualMinutes)
      : null;

    if (!normalizedTitle) {
      setError("Enter what you did.");
      return;
    }

    if (
      completionTime &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(completionTime)
    ) {
      setError("Choose a valid completion time.");
      return;
    }

    if (
      normalizedActualMinutes !== null &&
      (!Number.isInteger(normalizedActualMinutes) ||
        normalizedActualMinutes < 1 ||
        normalizedActualMinutes > 1440)
    ) {
      setError("Duration must be between 1 minute and 24 hours.");
      return;
    }

    onSave({
      id: initialItem?.id ?? crypto.randomUUID(),
      title: normalizedTitle,
      completionTime,
      actualMinutes: normalizedActualMinutes,
    });
  }

  return (
    <section
      className={
        embedded
          ? "w-full min-w-0 max-w-full space-y-5 text-foreground"
          : "w-full min-w-0 max-w-full space-y-5 rounded-2xl border border-border bg-card p-5 text-foreground"
      }
    >
      {!embedded && (
        <ClarityFormHeader
          title={initialItem ? "Edit completed item" : "Add something completed"}
          subtitle="Something you did that wasn't planned"
          closeLabel="Close completed item form"
          onClose={onCancel}
        />
      )}

      <label className="block min-w-0 space-y-2">
        <span className="text-sm font-semibold">What did you do?</span>
        <Input
          value={title}
          maxLength={200}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setError(null);
          }}
          className="h-12 rounded-xl"
        />
      </label>

      <TimeSelector
        name="completionTime"
        label="When"
        summary={formatCompletionTimeSummary(completionTime)}
        value={completionTime}
        onChange={(value) => {
          setCompletionTime(value);
          setError(null);
        }}
        onRemove={() => {
          setCompletionTime("");
          setError(null);
        }}
      />
      <TimeSpentField
        value={actualMinutes}
        onChange={(value) => {
          setActualMinutes(value);
          setError(null);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        onClick={save}
        disabled={submitting}
        className="h-12 w-full rounded-xl text-base"
      >
        {submitting
          ? "Saving…"
          : submitLabel ??
            (initialItem ? "Save changes" : "Add completed item")}
      </Button>
    </section>
  );
}

function formatCompletionTimeSummary(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return "Anytime";
  }

  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  const meridiem = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${meridiem}`;
}
