"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DailyLoopActionState } from "@/lib/clarity/action-state";

export type ActionFieldValues = {
  title?: string;
  actionType?: string;
  estimatedMinutes?: string | number;
  scheduledTime?: string;
  whyItExists?: string;
  definitionOfDone?: string;
  suggestedMethod?: string;
  context?: string;
  recurrencePattern?: string;
  recurrenceDays?: number[];
};

export function ActionFields({
  initialValues = {},
  state,
  detailsRequired = false,
  simple = false,
  onTitleChange,
}: {
  initialValues?: ActionFieldValues;
  state: DailyLoopActionState;
  detailsRequired?: boolean;
  simple?: boolean;
  onTitleChange?: (value: string) => void;
}) {
  const [timing, setTiming] = useState(
    initialValues.actionType === "fixed" ? "fixed" : "flexible",
  );

  return (
    <div className="space-y-5">
      <Field label="What needs to be done?" error={state.fieldErrors?.title?.[0]}>
        <Input
          name="title"
          defaultValue={initialValues.title}
          maxLength={200}
          required
          onChange={(event) => onTitleChange?.(event.currentTarget.value)}
          className="h-12 rounded-xl"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When?</legend>
        <div className="grid grid-cols-2 gap-2">
          <TimingChoice
            checked={timing === "flexible"}
            label="Anytime today"
            value="flexible"
            onChange={setTiming}
          />
          <TimingChoice
            checked={timing === "fixed"}
            label="At a specific time"
            value="fixed"
            onChange={setTiming}
          />
        </div>
      </fieldset>

      {timing === "fixed" && (
        <Field
          label="Specific time"
          error={state.fieldErrors?.scheduledTime?.[0]}
        >
          <Input
            name="scheduledTime"
            type="time"
            defaultValue={initialValues.scheduledTime}
            required
            className="h-12 rounded-xl"
          />
        </Field>
      )}
      {timing === "flexible" && (
        <input type="hidden" name="scheduledTime" value="" />
      )}

      <Field
        label="How long?"
        error={state.fieldErrors?.estimatedMinutes?.[0]}
      >
        <Input
          name="estimatedMinutes"
          type="number"
          min={1}
          max={1440}
          inputMode="numeric"
          defaultValue={initialValues.estimatedMinutes ?? 30}
          required
          className="h-12 rounded-xl"
        />
      </Field>

      {simple && (
        <>
          <Field
            label="Anything Clarity should know? — optional"
            error={state.fieldErrors?.context?.[0]}
          >
            <Textarea
              name="context"
              maxLength={990}
              defaultValue={initialValues.context}
              placeholder="A deadline, constraint, or useful detail."
              className="min-h-20"
            />
          </Field>
          <RecurrenceFields
            initialPattern={initialValues.recurrencePattern}
            initialDays={initialValues.recurrenceDays}
            error={state.fieldErrors?.recurrenceDays?.[0]}
          />
        </>
      )}

      {!simple && (
        <>
          <Field
            label={`Why it matters${detailsRequired ? "" : " (optional)"}`}
            error={state.fieldErrors?.whyItExists?.[0]}
          >
            <Textarea
              name="whyItExists"
              defaultValue={initialValues.whyItExists}
              maxLength={1000}
              required={detailsRequired}
              className="min-h-20"
            />
          </Field>

          <Field
            label={`Definition of done${detailsRequired ? "" : " (optional)"}`}
            error={state.fieldErrors?.definitionOfDone?.[0]}
          >
            <Textarea
              name="definitionOfDone"
              defaultValue={initialValues.definitionOfDone}
              maxLength={1000}
              required={detailsRequired}
              className="min-h-20"
            />
          </Field>

          <Field
            label={`Suggested method${detailsRequired ? "" : " (optional)"}`}
            error={state.fieldErrors?.suggestedMethod?.[0]}
          >
            <Textarea
              name="suggestedMethod"
              defaultValue={initialValues.suggestedMethod}
              maxLength={2000}
              required={detailsRequired}
              className="min-h-20"
            />
          </Field>
        </>
      )}
    </div>
  );
}

const weekdays = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

function RecurrenceFields({
  initialPattern = "none",
  initialDays = [],
  error,
}: {
  initialPattern?: string;
  initialDays?: number[];
  error?: string;
}) {
  const [pattern, setPattern] = useState(
    ["none", "daily", "weekly", "certain_days"].includes(initialPattern)
      ? initialPattern
      : "none",
  );
  const [selectedDays, setSelectedDays] = useState(initialDays);

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  return (
    <details className="group rounded-xl bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>Does this repeat?</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {recurrenceLabel(pattern)}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <fieldset className="space-y-4 px-4 pb-4 pt-2">
        <legend className="sr-only">Recurrence</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["none", "No"],
            ["daily", "Daily"],
            ["weekly", "Weekly"],
            ["certain_days", "Certain days"],
          ].map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold ${
                pattern === value
                  ? "border-[var(--clarity-completed)] bg-secondary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <input
                type="radio"
                name="recurrencePattern"
                value={value}
                checked={pattern === value}
                onChange={() => setPattern(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>

        {pattern === "certain_days" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Repeat on</p>
            <div className="grid grid-cols-7 gap-1.5">
              {weekdays.map((day) => {
                const selected = selectedDays.includes(day.value);

                return (
                  <label
                    key={day.value}
                    className={`flex aspect-square cursor-pointer items-center justify-center rounded-full border text-xs font-semibold ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                    aria-label={weekdayName(day.value)}
                  >
                    <input
                      type="checkbox"
                      name="recurrenceDays"
                      value={day.value}
                      checked={selected}
                      onChange={() => toggleDay(day.value)}
                      className="sr-only"
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-[var(--clarity-completed)]">{error}</p>
        )}
      </fieldset>
    </details>
  );
}

function recurrenceLabel(pattern: string) {
  if (pattern === "certain_days") {
    return "Certain days";
  }

  return pattern.charAt(0).toUpperCase() + pattern.slice(1);
}

function weekdayName(day: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][day];
}

function TimingChoice({
  checked,
  label,
  value,
  onChange,
}: {
  checked: boolean;
  label: string;
  value: "fixed" | "flexible";
  onChange: (value: "fixed" | "flexible") => void;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold transition-colors active:scale-[0.99] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        checked
          ? "border-[var(--clarity-completed)] bg-secondary text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <input
        type="radio"
        name="actionType"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error && (
        <p className="text-sm text-[var(--clarity-completed)]">{error}</p>
      )}
    </label>
  );
}
