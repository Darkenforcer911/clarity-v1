"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/clarity/duration";

const choices = [
  "15",
  "30",
  "45",
  "60",
  "120",
] as const;

export function TimeSpentField({
  value,
  onChange,
  plannedMinutes,
}: {
  value: string;
  onChange: (value: string) => void;
  plannedMinutes?: number;
}) {
  const [custom, setCustom] = useState(
    () =>
      Boolean(value) &&
      !choices.some((choice) => choice === value),
  );
  const invalid = Boolean(value) && !isValidDuration(value);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">How long?</legend>
      <p className="text-xs text-muted-foreground">
        {plannedMinutes
          ? `Planned ${formatDuration(plannedMinutes)} · Actual time is optional`
          : "Actual time is optional"}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={!custom && value === choice}
            onClick={() => {
              setCustom(false);
              onChange(choice);
            }}
            className={`min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !custom && value === choice
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {formatDuration(Number(choice))}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            if (choices.some((choice) => choice === value)) {
              onChange("");
            }
          }}
          className={`min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            custom
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          }`}
        >
          Custom
        </button>
      </div>

      {custom && (
        <label className="flex items-center gap-2">
          <span className="sr-only">Custom time spent</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            className="h-11 min-w-0 rounded-xl"
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            minutes
          </span>
        </label>
      )}

      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Duration must be between 1 minute and 24 hours.
        </p>
      )}

      {value && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          className="h-9 rounded-lg px-2 text-xs text-muted-foreground"
        >
          Remove duration
        </Button>
      )}
    </fieldset>
  );
}

function isValidDuration(value: string) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
}
