"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { progressExplanationError } from "@/lib/clarity/recap-validation";
import { TimeSpentField } from "./time-spent-field";

export type HistoricalActivity = {
  id: string;
  title: string;
  outcome: "finished" | "made_progress";
  completionTime: string;
  timeUnknown: boolean;
  estimatedMinutes: number | null;
  progressNote: string;
  remainingWork?: string;
  approximateDate?: string | null;
};

export function HistoricalActivityForm({
  day,
  initialActivity,
  onSave,
  onCancel,
}: {
  day: string;
  initialActivity?: HistoricalActivity;
  onSave: (activity: HistoricalActivity) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialActivity?.title ?? "");
  const [outcome, setOutcome] = useState<
    HistoricalActivity["outcome"] | undefined
  >(initialActivity?.outcome);
  const [showDetails, setShowDetails] = useState(
    Boolean(
      initialActivity?.completionTime ||
        initialActivity?.estimatedMinutes ||
        initialActivity?.remainingWork,
    ),
  );
  const [completionTime, setCompletionTime] = useState(
    initialActivity?.completionTime ?? "",
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initialActivity?.estimatedMinutes?.toString() ?? "",
  );
  const [progressNote, setProgressNote] = useState(
    initialActivity?.progressNote ?? "",
  );
  const [remainingWork, setRemainingWork] = useState(
    initialActivity?.remainingWork ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const normalizedTitle = title.trim();
    const minutes = estimatedMinutes ? Number(estimatedMinutes) : null;

    if (!normalizedTitle) {
      setError(`Describe what happened ${day}.`);
      return;
    }

    if (!outcome) {
      setError("Choose Finished or Made progress.");
      return;
    }

    if (outcome === "made_progress") {
      const progressError = progressExplanationError(progressNote);

      if (progressError) {
        setError(progressError);
        return;
      }
    }

    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
    ) {
      setError("Time spent must be between 1 and 1,440 minutes.");
      return;
    }

    onSave({
      id: initialActivity?.id ?? crypto.randomUUID(),
      title: normalizedTitle,
      outcome,
      completionTime: outcome === "finished" ? completionTime : "",
      timeUnknown: outcome === "finished" && !completionTime,
      estimatedMinutes: minutes,
      progressNote:
        outcome === "made_progress" ? progressNote.trim() : "",
      remainingWork:
        outcome === "made_progress" ? remainingWork.trim() : "",
      approximateDate: initialActivity?.approximateDate,
    });
  }

  return (
    <section className="space-y-4 border-t border-border/70 pt-4">
      <h2 className="font-semibold">What happened {day}?</h2>
      <label className="block">
        <span className="sr-only">Natural-language description</span>
        <Textarea
          value={title}
          maxLength={200}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setError(null);
          }}
          className="min-h-24 rounded-xl"
        />
      </label>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-semibold">Outcome</legend>
        <Choice
          selected={outcome === "finished"}
          onClick={() => {
            setOutcome("finished");
            setShowDetails(false);
            setError(null);
          }}
        >
          Finished
        </Choice>
        <Choice
          selected={outcome === "made_progress"}
          onClick={() => {
            setOutcome("made_progress");
            setShowDetails(false);
            setError(null);
          }}
        >
          Made progress
        </Choice>
      </fieldset>

      {outcome === "made_progress" && (
        <label className="block space-y-2">
          <span className="text-sm font-semibold">
            What did you get done?
          </span>
          <Textarea
            value={progressNote}
            maxLength={500}
            placeholder="Finished the experience section and added two roles."
            onChange={(event) => {
              setProgressNote(event.currentTarget.value);
              setError(null);
            }}
            className="min-h-20 rounded-xl"
          />
        </label>
      )}

      {outcome && !showDetails ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowDetails(true)}
          className="h-10 rounded-xl px-2 text-sm text-muted-foreground"
        >
          + Add details
        </Button>
      ) : outcome && showDetails ? (
        <div className="space-y-3 rounded-xl bg-background p-3">
          <TimeSpentField
            value={estimatedMinutes}
            onChange={(value) => {
              setEstimatedMinutes(value);
              setError(null);
            }}
          />
          {outcome === "finished" && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Completed around
              </span>
              <Input
                type="time"
                value={completionTime}
                onChange={(event) => {
                  setCompletionTime(event.currentTarget.value);
                  setError(null);
                }}
                className="h-11 rounded-xl"
              />
            </label>
          )}
          {outcome === "made_progress" && (
            <DetailText
              label="What remains or got in the way?"
              value={remainingWork}
              onChange={(value) => {
                setRemainingWork(value);
                setError(null);
              }}
            />
          )}
        </div>
      ) : null}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-11 rounded-xl"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={save}
          className="h-11 rounded-xl"
        >
          {initialActivity ? "Save" : "Add"}
        </Button>
      </div>
    </section>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DetailText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Textarea
        value={value}
        maxLength={500}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-16 rounded-xl"
      />
    </label>
  );
}
