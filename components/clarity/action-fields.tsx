"use client";

import { ChevronDown, Clock3 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DailyLoopActionState } from "@/lib/clarity/action-state";
import {
  resolveEstimatedDuration,
  splitEstimatedDuration,
} from "@/lib/clarity/duration";

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
  hideGeneratedDetails = false,
  onTitleChange,
}: {
  initialValues?: ActionFieldValues;
  state: DailyLoopActionState;
  detailsRequired?: boolean;
  simple?: boolean;
  hideGeneratedDetails?: boolean;
  onTitleChange?: (value: string) => void;
}) {
  const [timing, setTiming] = useState(
    initialValues.actionType === "fixed" ? "fixed" : "flexible",
  );
  const [scheduledTime, setScheduledTime] = useState(
    initialValues.scheduledTime ?? "",
  );
  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
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

      <fieldset className="w-full min-w-0 max-w-full space-y-2">
        <legend className="text-sm font-medium">When?</legend>
        <div className="grid min-w-0 grid-cols-2 gap-2">
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
        <div className="w-full min-w-0 max-w-full space-y-2">
          <label className="flex min-h-12 w-full min-w-0 max-w-full items-center gap-3 rounded-xl border border-border bg-card px-3">
            <span className="shrink-0 text-sm font-medium">Time</span>
            <span className="relative ml-auto flex min-h-11 min-w-0 max-w-[9rem] flex-1 cursor-pointer items-center justify-end gap-2 overflow-hidden rounded-lg px-2 text-sm font-semibold text-foreground focus-within:ring-2 focus-within:ring-ring">
              <Clock3
                className="size-4 shrink-0 text-[var(--clarity-completed)]"
                aria-hidden="true"
              />
              <span className="truncate text-right">
                {formatTimeDisplay(scheduledTime)}
              </span>
              <Input
                name="scheduledTime"
                type="time"
                value={scheduledTime}
                onChange={(event) =>
                  setScheduledTime(event.currentTarget.value)
                }
                required
                aria-label="Time"
                className="absolute inset-0 h-full w-full cursor-pointer border-0 p-0 opacity-0"
              />
            </span>
          </label>
          {state.fieldErrors?.scheduledTime?.[0] && (
            <p className="text-sm text-[var(--clarity-completed)]">
              {state.fieldErrors.scheduledTime[0]}
            </p>
          )}
        </div>
      )}
      {timing === "flexible" && (
        <input type="hidden" name="scheduledTime" value="" />
      )}

      <DurationFields
        initialMinutes={initialValues.estimatedMinutes ?? 30}
        error={state.fieldErrors?.estimatedMinutes?.[0]}
      />

      {simple && (
        <>
          <Field
            label="Details — optional"
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
          {hideGeneratedDetails ? (
            <>
              <input
                type="hidden"
                name="whyItExists"
                defaultValue={initialValues.whyItExists}
              />
              <input
                type="hidden"
                name="definitionOfDone"
                defaultValue={initialValues.definitionOfDone}
              />
              <input
                type="hidden"
                name="suggestedMethod"
                defaultValue={initialValues.suggestedMethod}
              />
            </>
          ) : (
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
        </>
      )}
    </div>
  );
}

function formatTimeDisplay(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return "Choose time";
  }

  const [hours, minutes] = value.split(":").map(Number);
  const period = hours < 12 ? "am" : "pm";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function DurationFields({
  initialMinutes = 30,
  error,
}: {
  initialMinutes?: string | number;
  error?: string;
}) {
  const initialDuration = splitEstimatedDuration(initialMinutes);
  const [hours, setHours] = useState(initialDuration.hours);
  const [minutes, setMinutes] = useState(initialDuration.minutes);
  const duration = resolveEstimatedDuration(hours, minutes);
  const minutesMax = hours === "24" ? 0 : 59;
  const displayedError = duration.error ?? error;

  return (
    <fieldset className="w-full min-w-0 max-w-full space-y-2">
      <legend className="text-sm font-medium">Estimated duration</legend>
      <input
        type="hidden"
        name="estimatedMinutes"
        value={duration.totalMinutes ?? ""}
      />
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label className="block min-w-0 space-y-2">
          <span className="block text-xs font-medium text-muted-foreground">
            Hours
          </span>
          <span className="relative block min-w-0">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              step={1}
              required
              value={hours}
              aria-invalid={Boolean(displayedError)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (/^\d*$/.test(value)) {
                  setHours(value);
                }
              }}
              className="duration-number-input h-12 w-full min-w-0 max-w-full rounded-xl pr-9"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              h
            </span>
          </span>
        </label>
        <label className="block min-w-0 space-y-2">
          <span className="block text-xs font-medium text-muted-foreground">
            Minutes
          </span>
          <span className="relative block min-w-0">
            <Input
              type="number"
              inputMode="numeric"
              min={hours === "0" ? 1 : 0}
              max={minutesMax}
              step={1}
              required
              value={minutes}
              aria-invalid={Boolean(displayedError)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (/^\d*$/.test(value)) {
                  setMinutes(value);
                }
              }}
              className="duration-number-input h-12 w-full min-w-0 max-w-full rounded-xl pr-9"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              m
            </span>
          </span>
        </label>
      </div>
      {displayedError && (
        <p className="text-sm text-[var(--clarity-completed)]">
          {displayedError}
        </p>
      )}
    </fieldset>
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
      className={`flex min-h-14 min-w-0 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold transition-colors active:scale-[0.99] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
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
    <label className="block w-full min-w-0 max-w-full space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {error && (
        <p className="text-sm text-[var(--clarity-completed)]">{error}</p>
      )}
    </label>
  );
}
