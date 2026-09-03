"use client";

import { CalendarClock, Timer } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DailyLoopActionState } from "@/lib/clarity/action-state";
import { resolveActionTimingFromOptionalTime } from "@/lib/clarity/action-time-field";
import {
  formatActionRecurrenceSummary,
  getActionRecurrencePrimaryChoice,
  resolveActionRecurrencePrimaryChoice,
} from "@/lib/clarity/action-recurrence";
import {
  formatDuration,
  resolveEstimatedDuration,
  splitEstimatedDuration,
} from "@/lib/clarity/duration";
import { resolveSecondarySettingExpansion } from "@/lib/clarity/secondary-setting-accordion";
import { CalendarReminderField } from "./calendar-reminder-field";
import { DetailsControl } from "./details-control";
import { RecurrenceControl } from "./recurrence-control";
import {
  SecondarySettingDisclosure,
  SecondarySettingStack,
} from "./secondary-setting-disclosure";
import { OptionalTimeSelector } from "./time-selector";
import { TimeSpentField } from "./time-spent-field";

export type ActionFieldValues = {
  title?: string;
  actionType?: string;
  estimatedMinutes?: string | number;
  scheduledTime?: string;
  completedTime?: string;
  actualMinutes?: string | number | null;
  whyItExists?: string;
  definitionOfDone?: string;
  suggestedMethod?: string;
  context?: string;
  recurrencePattern?: string;
  recurrenceDays?: number[];
  dueLocalDate?: string;
  dueLocalTime?: string;
  reminderOffsets?: number[];
  details?: string;
};

export function ActionFields({
  initialValues = {},
  state,
  detailsRequired = false,
  simple = false,
  hideGeneratedDetails = false,
  showRecurrence = true,
  showDue = true,
  showReminders = true,
  showDetails = true,
  mode = "planned",
  localDate = "",
  timezone = "UTC",
  now = new Date(),
  onTitleChange,
}: {
  initialValues?: ActionFieldValues;
  state: Pick<DailyLoopActionState, "fieldErrors">;
  detailsRequired?: boolean;
  simple?: boolean;
  hideGeneratedDetails?: boolean;
  showRecurrence?: boolean;
  showDue?: boolean;
  showReminders?: boolean;
  showDetails?: boolean;
  mode?: "planned" | "completed";
  localDate?: string;
  timezone?: string;
  now?: Date;
  onTitleChange?: (value: string) => void;
}) {
  const [details, setDetails] = useState(
    initialValues.details ?? initialValues.context ?? "",
  );
  const [whenTime, setWhenTime] = useState(
    mode === "completed"
      ? initialValues.completedTime ?? ""
      : initialValues.scheduledTime ?? "",
  );
  const [actualMinutes, setActualMinutes] = useState(
    initialValues.actualMinutes?.toString() ?? "",
  );
  const [recurrencePattern, setRecurrencePattern] = useState(
    ["daily", "weekly", "certain_days"].includes(
      initialValues.recurrencePattern ?? "none",
    )
      ? (initialValues.recurrencePattern ?? "none")
      : "none",
  );
  const [dueLocalDate, setDueLocalDate] = useState(
    initialValues.dueLocalDate ?? "",
  );
  const [dueLocalTime, setDueLocalTime] = useState(
    initialValues.dueLocalTime ?? "",
  );
  const [reminderOffsets, setReminderOffsets] = useState(
    initialValues.reminderOffsets ?? [],
  );
  const timeError = state.fieldErrors?.[
    mode === "completed" ? "completedTime" : "scheduledTime"
  ]?.[0];
  const durationError = state.fieldErrors?.[
    mode === "completed" ? "actualMinutes" : "estimatedMinutes"
  ]?.[0];
  const contextError =
    state.fieldErrors?.details?.[0] ?? state.fieldErrors?.context?.[0];
  const dueError = state.fieldErrors?.dueLocalDate?.[0];
  const reminderError = state.fieldErrors?.reminderOffsets?.[0];
  const recurrenceError = state.fieldErrors?.recurrenceDays?.[0];
  const [openSection, setOpenSection] = useState<
    "time" | "duration" | "due" | "reminders" | "details" | "repeats" | null
  >(() =>
    timeError
      ? "time"
      : durationError
        ? "duration"
        : contextError
          ? "details"
          : dueError
            ? "due"
            : reminderError
              ? "reminders"
              : recurrenceError
                ? "repeats"
                : null,
  );
  const setSectionExpanded = (
    section: "time" | "duration" | "due" | "reminders" | "details" | "repeats",
    expanded: boolean,
  ) => {
    setOpenSection((current) =>
      resolveSecondarySettingExpansion(current, section, expanded),
    );
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
      <input type="hidden" name="localDate" value={localDate} />
      <Field label="What" error={state.fieldErrors?.title?.[0]}>
        <Input
          name="title"
          defaultValue={initialValues.title}
          maxLength={200}
          required
          onChange={(event) => onTitleChange?.(event.currentTarget.value)}
          className="h-12 rounded-xl"
        />
      </Field>

      <ActionTimeField
        name={mode === "completed" ? "completedTime" : "scheduledTime"}
        scheduledTime={whenTime}
        onChange={setWhenTime}
        includeActionType={mode === "planned"}
        error={timeError}
        expanded={openSection === "time"}
        onExpandedChange={(expanded) =>
          setSectionExpanded("time", expanded)
        }
      />

      {simple ? (
        <SecondarySettingStack>
          {mode === "planned" ? (
            <DurationFields
              initialMinutes={initialValues.estimatedMinutes ?? 30}
              error={durationError}
              expanded={openSection === "duration"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("duration", expanded)
              }
            />
          ) : (
            <CompletedDurationField
              value={actualMinutes}
              onChange={setActualMinutes}
              error={durationError}
              expanded={openSection === "duration"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("duration", expanded)
              }
            />
          )}
          {showDue && (
            <ActionDueField
              dueLocalDate={dueLocalDate}
              dueLocalTime={dueLocalTime}
              onDateChange={setDueLocalDate}
              onTimeChange={setDueLocalTime}
              error={dueError}
              expanded={openSection === "due"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("due", expanded)
              }
            />
          )}
          {showRecurrence && (
            <RecurrenceFields
              pattern={recurrencePattern}
              onPatternChange={setRecurrencePattern}
              initialDays={initialValues.recurrenceDays}
              error={recurrenceError}
              expanded={openSection === "repeats"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("repeats", expanded)
              }
            />
          )}
          {showReminders &&
            (mode === "planned" || recurrencePattern !== "none") && (
            <CalendarReminderField
              kind="event"
              atTimeLabel="At time"
              offsets={reminderOffsets}
              scheduleContext={{
                occurrenceDate: whenTime
                  ? localDate
                  : dueLocalDate || localDate,
                wallClockTime:
                  mode === "completed"
                    ? dueLocalTime || null
                    : whenTime || dueLocalTime || null,
                timezone,
                now,
                recurrence: "none",
              }}
              expanded={openSection === "reminders"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("reminders", expanded)
              }
              onChange={setReminderOffsets}
            />
          )}
          {showDetails && (
            <DetailsControl
              name="details"
              value={details}
              onChange={setDetails}
              maxLength={2000}
              placeholder="A deadline, constraint, or useful detail."
              error={contextError}
              expanded={openSection === "details"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("details", expanded)
              }
            />
          )}
          {!showDetails && <input type="hidden" name="details" value="" />}
          <input type="hidden" name="context" value={details} />
          {hideGeneratedDetails && (
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
          )}
        </SecondarySettingStack>
      ) : (
        <>
          <DurationFields
            initialMinutes={initialValues.estimatedMinutes ?? 30}
            error={durationError}
            expanded={openSection === "duration"}
            onExpandedChange={(expanded) =>
              setSectionExpanded("duration", expanded)
            }
          />
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

export function ActionTimeField({
  name = "scheduledTime",
  scheduledTime,
  onChange,
  includeActionType = true,
  error,
  expanded,
  onExpandedChange,
}: {
  name?: string;
  scheduledTime: string;
  onChange: (value: string) => void;
  includeActionType?: boolean;
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const timing = resolveActionTimingFromOptionalTime(scheduledTime);

  return (
    <div className="w-full min-w-0 max-w-full">
      {includeActionType && (
        <input type="hidden" name="actionType" value={timing.actionType} />
      )}
      <OptionalTimeSelector
        name={name}
        label="When"
        value={scheduledTime}
        onChange={onChange}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        error={error}
      />
    </div>
  );
}

export function OptionalActionTimeField({
  initialScheduledTime = "",
  error,
  expanded,
  onExpandedChange,
}: {
  initialScheduledTime?: string;
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime);
  return (
    <ActionTimeField
      scheduledTime={scheduledTime}
      onChange={setScheduledTime}
      error={error}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    />
  );
}

function CompletedDurationField({
  value,
  onChange,
  error,
  expanded,
  onExpandedChange,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const parsed = Number(value);
  const summary =
    value && Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440
      ? formatDuration(parsed)
      : "Not set";

  return (
    <fieldset className="m-0 w-full min-w-0 max-w-full border-0 p-0">
      <legend className="sr-only">Duration</legend>
      <input type="hidden" name="actualMinutes" value={value} />
      <SecondarySettingDisclosure
        icon={Timer}
        label="Duration"
        summary={summary}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      >
        <TimeSpentField
          label="Duration"
          value={value}
          onChange={onChange}
          hideHeading
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </SecondarySettingDisclosure>
    </fieldset>
  );
}

function ActionDueField({
  dueLocalDate,
  dueLocalTime,
  onDateChange,
  onTimeChange,
  error,
  expanded,
  onExpandedChange,
}: {
  dueLocalDate: string;
  dueLocalTime: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const summary = dueLocalDate
    ? [dueLocalDate, dueLocalTime ? formatActionTime(dueLocalTime) : null]
        .filter(Boolean)
        .join(" · ")
    : "Not set";

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Due</legend>
      <SecondarySettingDisclosure
        icon={CalendarClock}
        label="Due"
        summary={summary}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <Input
              type="date"
              name="dueLocalDate"
              value={dueLocalDate}
              onChange={(event) => onDateChange(event.currentTarget.value)}
              className="h-12 rounded-xl"
            />
          </label>
          <label className="block min-w-0 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Time</span>
            <Input
              type="time"
              name="dueLocalTime"
              value={dueLocalTime}
              disabled={!dueLocalDate}
              onChange={(event) => onTimeChange(event.currentTarget.value)}
              className="h-12 rounded-xl"
            />
          </label>
        </div>
        {dueLocalDate && (
          <button
            type="button"
            onClick={() => {
              onDateChange("");
              onTimeChange("");
            }}
            className="min-h-10 rounded-lg px-2 text-xs text-muted-foreground"
          >
            Clear due
          </button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </SecondarySettingDisclosure>
    </fieldset>
  );
}

function formatActionTime(value: string) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

export function DurationFields({
  initialMinutes = 30,
  error,
  expanded,
  onExpandedChange,
}: {
  initialMinutes?: string | number;
  error?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const initialDuration = splitEstimatedDuration(initialMinutes);
  const [hours, setHours] = useState(initialDuration.hours);
  const [minutes, setMinutes] = useState(initialDuration.minutes);
  const duration = resolveEstimatedDuration(hours, minutes);
  const minutesMax = hours === "24" ? 0 : 59;
  const displayedError = duration.error ?? error;
  const summary = formatDuration(duration.totalMinutes ?? 0);

  const editor = (
    <>
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
        <p className="text-sm text-destructive">
          {displayedError}
        </p>
      )}
    </>
  );

  if (expanded !== undefined && onExpandedChange) {
    return (
      <fieldset className="m-0 w-full min-w-0 max-w-full border-0 p-0">
        <legend className="sr-only">Duration</legend>
        <input
          type="hidden"
          name="estimatedMinutes"
          value={duration.totalMinutes ?? ""}
        />
        <SecondarySettingDisclosure
          icon={Timer}
          label="Duration"
          summary={summary}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
        >
          {editor}
        </SecondarySettingDisclosure>
      </fieldset>
    );
  }

  return (
    <fieldset className="w-full min-w-0 max-w-full space-y-2">
      <legend className="text-sm font-medium">Duration</legend>
      <input
        type="hidden"
        name="estimatedMinutes"
        value={duration.totalMinutes ?? ""}
      />
      {editor}
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
  pattern,
  onPatternChange,
  initialDays = [],
  error,
  expanded,
  onExpandedChange,
}: {
  pattern: string;
  onPatternChange: (pattern: string) => void;
  initialDays?: number[];
  error?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [selectedDays, setSelectedDays] = useState(initialDays);
  const summary = formatActionRecurrenceSummary(pattern, selectedDays);

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );
  }

  return (
    <div className="min-w-0">
      <input type="hidden" name="recurrencePattern" value={pattern} />
      <RecurrenceControl
        expanded={expanded}
        summary={summary}
        value={getActionRecurrencePrimaryChoice(pattern)}
        onExpandedChange={onExpandedChange}
        onChange={(choice) =>
          onPatternChange(resolveActionRecurrencePrimaryChoice(choice))
        }
      >
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
                        ? "border-ring bg-secondary text-foreground"
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
      </RecurrenceControl>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
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
        <p className="text-sm text-destructive">{error}</p>
      )}
    </label>
  );
}
