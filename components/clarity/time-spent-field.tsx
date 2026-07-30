"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

const choices = [
  { label: "15 min", value: "15" },
  { label: "30 min", value: "30" },
  { label: "45 min", value: "45" },
  { label: "1 hr", value: "60" },
  { label: "2 hr", value: "120" },
] as const;

export function TimeSpentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(
    () =>
      Boolean(value) &&
      !choices.some((choice) => choice.value === value),
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Time spent</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={!custom && value === choice.value}
            onClick={() => {
              setCustom(false);
              onChange(choice.value);
            }}
            className={`min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !custom && value === choice.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {choice.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            if (choices.some((choice) => choice.value === value)) {
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
    </fieldset>
  );
}
