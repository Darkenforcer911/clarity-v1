"use client";

import { Repeat2 } from "lucide-react";
import type { RecurrencePrimaryChoice } from "@/lib/clarity/recurrence-ui";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";

export const actionRecurrenceChoices: Array<{
  value: RecurrencePrimaryChoice;
  label: string;
}> = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

export function RecurrenceControl({
  expanded,
  summary,
  value,
  onExpandedChange,
  onChange,
  onDone,
  children,
  choices = actionRecurrenceChoices,
  showDone = true,
}: {
  expanded: boolean;
  summary: string;
  value: RecurrencePrimaryChoice;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (value: RecurrencePrimaryChoice) => void;
  onDone?: () => void;
  children?: React.ReactNode;
  choices?: ReadonlyArray<{ value: RecurrencePrimaryChoice; label: string }>;
  showDone?: boolean;
}) {
  return (
    <fieldset className="m-0 w-full min-w-0 max-w-full border-0 p-0">
      <legend className="sr-only">Repeats</legend>
      <SecondarySettingDisclosure
        icon={Repeat2}
        label="Repeats"
        summary={summary}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onDone={onDone}
        showDone={showDone}
      >
        <div
          role="group"
          aria-label="Recurrence"
          className="grid min-w-0 grid-cols-4 gap-1.5"
        >
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={value === choice.value}
              onClick={() => onChange(choice.value)}
              className={`min-h-11 min-w-0 rounded-lg border px-1.5 py-1 text-xs font-semibold leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                value === choice.value
                  ? "border-ring bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>

        {value === "custom" && children}
      </SecondarySettingDisclosure>
    </fieldset>
  );
}
