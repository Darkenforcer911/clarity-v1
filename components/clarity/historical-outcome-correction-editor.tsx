"use client";

import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { formatDetailsSummary } from "@/lib/clarity/details-ui";
import { initialHistoricalCompletionTime } from "@/lib/clarity/historical-completion-time";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClarityFormHeader } from "./clarity-form-header";
import { SecondarySettingDisclosure } from "./secondary-setting-disclosure";
import { TimeSelector } from "./time-selector";

export type HistoricalOutcomeOption<T extends string> = readonly [T, string];

export function HistoricalOutcomeCorrectionEditor<T extends string>({
  hiddenFields,
  options,
  initialOutcome,
  completedOutcome,
  initialCompletionTime,
  initialNote,
  noteMaxLength,
  noteAvailable,
  supportingCopy,
  submitting,
  error,
  onCancel,
  onSubmit,
}: {
  hiddenFields: React.ReactNode;
  options: readonly HistoricalOutcomeOption<T>[];
  initialOutcome: T;
  completedOutcome: T;
  initialCompletionTime: string;
  initialNote: string;
  noteMaxLength: number;
  noteAvailable: (outcome: T) => boolean;
  supportingCopy: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [outcome, setOutcome] = useState<T>(initialOutcome);
  const [completionTime, setCompletionTime] = useState(() =>
    initialHistoricalCompletionTime({
      completed: initialOutcome === completedOutcome,
      existingCompletionTime: initialCompletionTime,
    }),
  );
  const [note, setNote] = useState(initialNote);
  const [openSection, setOpenSection] = useState<"note" | null>(null);
  const completed = outcome === completedOutcome;
  const showNote = noteAvailable(outcome);
  const outcomeSelected = options.some(([value]) => value === outcome);

  return (
    <form
      data-slot="historical-outcome-correction-editor"
      onSubmit={onSubmit}
      className="space-y-5 border-t border-border pt-4"
    >
      {hiddenFields}
      <input type="hidden" name="outcome" value={outcome} />
      <input
        type="hidden"
        name="completedTime"
        value={completed ? completionTime : ""}
      />
      <input type="hidden" name="note" value={showNote ? note : ""} />

      <ClarityFormHeader
        title="Correct outcome"
        closeLabel="Close outcome correction"
        onClose={onCancel}
      />

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">What actually happened?</legend>
        {options.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={outcome === value ? "default" : "outline"}
            aria-pressed={outcome === value}
            onClick={() => {
              setOutcome(value);
            }}
            className="min-h-11 rounded-xl px-2 text-sm"
          >
            {label}
          </Button>
        ))}
      </fieldset>

      {completed && (
        <TimeSelector
          name="historicalCorrectionTime"
          label="When"
          summary={formatHistoricalTime(completionTime)}
          value={completionTime}
          onChange={setCompletionTime}
          onRemove={() => setCompletionTime("")}
        />
      )}

      {showNote && (
        <SecondarySettingDisclosure
          icon={NotebookPen}
          label="Note"
          summary={formatDetailsSummary(note)}
          expanded={openSection === "note"}
          onExpandedChange={(expanded) =>
            setOpenSection(expanded ? "note" : null)
          }
        >
          <label className="block min-w-0 space-y-2">
            <span className="sr-only">Note</span>
            <Textarea
              name="historicalCorrectionNote"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              maxLength={noteMaxLength}
              className="min-h-24"
            />
          </label>
        </SecondarySettingDisclosure>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        {supportingCopy}
      </p>

      <Button
        type="submit"
        disabled={submitting || !outcomeSelected}
        className="h-12 w-full rounded-xl text-base"
      >
        {submitting ? "Correcting…" : "Confirm correction"}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function formatHistoricalTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "Anytime";
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}
