"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDuration,
  parseDurationInput,
} from "@/lib/clarity/duration";

export function TimeSpentField({
  value,
  onChange,
  plannedMinutes,
  label = "How long?",
  hideHeading = false,
}: {
  value: string;
  onChange: (value: string) => void;
  plannedMinutes?: number;
  label?: string;
  hideHeading?: boolean;
}) {
  const [draft, setDraft] = useState(() => {
    const initialMinutes = Number(value);
    return Number.isInteger(initialMinutes) && initialMinutes > 0
      ? formatDuration(initialMinutes)
      : "";
  });
  const parsed = parseDurationInput(draft);
  const invalid = Boolean(draft.trim()) && Boolean(parsed.error);

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft);
    const result = parseDurationInput(nextDraft);
    onChange(
      result.error
        ? nextDraft
        : result.totalMinutes === null
          ? ""
          : String(result.totalMinutes),
    );
  }

  return (
    <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
      <legend className={hideHeading ? "sr-only" : "text-sm font-medium"}>
        {label}
      </legend>
      {!hideHeading && plannedMinutes && (
        <p className="text-xs text-muted-foreground">
          Planned {formatDuration(plannedMinutes)}
        </p>
      )}

      <Input
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={draft}
        aria-label={label}
        aria-invalid={invalid}
        placeholder="30m or 1h 30m"
        onChange={(event) => updateDraft(event.currentTarget.value)}
        className="h-12 w-full min-w-0 max-w-full rounded-xl"
      />

      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {parsed.error}
        </p>
      )}

      {draft && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => updateDraft("")}
          className="h-9 rounded-lg px-2 text-xs text-muted-foreground"
        >
          Remove duration
        </Button>
      )}
    </fieldset>
  );
}
