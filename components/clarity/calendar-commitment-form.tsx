"use client";

import { ChevronDown, Plus, Timer } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  createCalendarCommitmentAction,
  updateCalendarCommitmentAction,
} from "@/app/(app)/calendar/actions";
import { initialCalendarActionState } from "@/lib/clarity/calendar-action-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  type CalendarCommitment,
  getCalendarCommitmentRecurrenceRule,
} from "@/lib/clarity/calendar-commitments";
import { formatCommitmentTime } from "@/lib/clarity/calendar-rules";
import {
  getIsoWeekday,
  getLegacyCalendarRecurrencePreset,
  validateCalendarRecurrenceRule,
  type CalendarRecurrenceRule,
  type CalendarRecurrenceUnit,
} from "@/lib/clarity/calendar-recurrence";
import {
  formatEventDurationSummary,
  formatRecurrenceSummary,
  getCalendarRecurrencePrimaryChoice,
  getCommitmentKindPresentation,
  resolveCalendarRecurrencePrimaryChoice,
} from "@/lib/clarity/calendar-commitment-form-ui";
import {
  getDefaultReminderOffsets,
  getDefaultAvailableReminderOffsets,
  getReminderCommitmentKind,
  isReminderOffsetAvailable,
  normalizeSingleReminderOffsets,
  preserveReminderOffsets,
} from "@/lib/clarity/calendar-reminders";
import { resolveSecondarySettingExpansion } from "@/lib/clarity/secondary-setting-accordion";
import { CalendarReminderField } from "./calendar-reminder-field";
import { ClarityFormHeader } from "./clarity-form-header";
import { DetailsControl } from "./details-control";
import { PendingButton } from "./pending-button";
import { RecurrenceControl } from "./recurrence-control";
import {
  SecondarySettingDisclosure,
  SecondarySettingStack,
} from "./secondary-setting-disclosure";
import { TimeSelector } from "./time-selector";

type CalendarSecondarySection =
  | "time"
  | "duration"
  | "reminders"
  | "repeats"
  | "details";

export function CalendarCommitmentForm({
  selectedDate,
  commitment,
  initialType,
  onCancel,
  onSaved,
  timezone,
  now,
}: {
  selectedDate: string;
  commitment?: CalendarCommitment;
  initialType?: "event" | "deadline";
  onCancel: () => void;
  onSaved: () => void;
  timezone: string;
  now: Date;
}) {
  const serverAction = commitment
    ? updateCalendarCommitmentAction
    : createCalendarCommitmentAction;
  const [state, action] = useActionState(
    serverAction,
    initialCalendarActionState,
  );
  const [type, setType] = useState<"event" | "deadline">(
    commitment?.commitment_type ?? initialType ?? "event",
  );
  const [kindOpen, setKindOpen] = useState(!commitment && !initialType);
  const [noExactTime, setNoExactTime] = useState(
    commitment?.commitment_type === "deadline" &&
      !commitment.deadline_due_time,
  );
  const [localDate, setLocalDate] = useState(
    commitment?.local_date ?? selectedDate,
  );
  const [eventStartTime, setEventStartTime] = useState(
    commitment?.event_start_time?.slice(0, 5) ?? "",
  );
  const [deadlineDueTime, setDeadlineDueTime] = useState(
    commitment?.deadline_due_time?.slice(0, 5) ?? "",
  );
  const duration = commitment ? commitment.duration_minutes ?? 0 : 30;
  const [durationHours, setDurationHours] = useState(
    String(Math.floor(duration / 60)),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    String(duration % 60),
  );
  const reminderKind = getReminderCommitmentKind(
    type,
    type === "event" || !noExactTime,
  );
  const initialReminderKind = commitment
    ? getReminderCommitmentKind(
        commitment.commitment_type,
        commitment.commitment_type === "event" ||
          commitment.deadline_due_time !== null,
      )
    : "event";
  const initialCompatibleReminderOffsets = commitment
    ? preserveReminderOffsets(
        commitment.reminder_offsets_minutes,
        initialReminderKind,
      )
    : getDefaultReminderOffsets("event");
  const hadMultipleReminderOffsets =
    initialCompatibleReminderOffsets.length > 1;
  const [remindersTouched, setRemindersTouched] = useState(false);
  const [reminderOffsets, setReminderOffsets] = useState(() =>
    commitment
      ? normalizeSingleReminderOffsets(
          commitment.reminder_offsets_minutes,
          initialReminderKind,
        )
      : getDefaultReminderOffsets("event"),
  );
  const initialRecurrenceRule = commitment
    ? getCalendarCommitmentRecurrenceRule(commitment)
    : { unit: null, interval: 1, weekdays: [] } satisfies CalendarRecurrenceRule;
  const [recurrenceRule, setRecurrenceRule] = useState(initialRecurrenceRule);
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(initialRecurrenceRule.interval),
  );
  const [recurrenceChoice, setRecurrenceChoice] = useState(() =>
    getCalendarRecurrencePrimaryChoice(initialRecurrenceRule, localDate),
  );
  const [recurrenceDraftError, setRecurrenceDraftError] = useState<
    string | null
  >(null);
  const recurrenceDraftRule = useMemo(() => ({
    ...recurrenceRule,
    interval: /^\d+$/.test(recurrenceInterval)
      ? Number(recurrenceInterval)
      : Number.NaN,
  }), [recurrenceInterval, recurrenceRule]);
  const recurrenceDraftValidation =
    validateCalendarRecurrenceRule(recurrenceDraftRule);
  const recurrenceForScheduling = recurrenceDraftValidation
    ? recurrenceRule
    : recurrenceDraftRule;
  const recurrence = getLegacyCalendarRecurrencePreset(
    recurrenceForScheduling,
    localDate,
  );
  const reminderScheduleContext = useMemo(
    () => ({
      occurrenceDate: localDate,
      wallClockTime:
        reminderKind === "event"
          ? eventStartTime
          : reminderKind === "timed_deadline"
            ? deadlineDueTime
            : null,
      timezone,
      now,
      recurrence,
      recurrenceRule: recurrenceForScheduling,
    }),
    [
      deadlineDueTime,
      eventStartTime,
      localDate,
      now,
      recurrence,
      recurrenceForScheduling,
      reminderKind,
      timezone,
    ],
  );
  const effectiveReminderOffsets = useMemo(
    () =>
      !commitment && !remindersTouched
        ? getDefaultAvailableReminderOffsets(
            reminderKind,
            reminderScheduleContext,
          )
        : reminderOffsets,
    [
      commitment,
      reminderKind,
      reminderOffsets,
      reminderScheduleContext,
      remindersTouched,
    ],
  );
  const reminderScheduleInvalid = effectiveReminderOffsets.some(
    (offset) =>
      !isReminderOffsetAvailable(
        reminderKind,
        offset,
        reminderScheduleContext,
      ),
  );
  const [details, setDetails] = useState(commitment?.details ?? "");
  const normalizedError = state.error?.toLowerCase() ?? "";
  const [openSection, setOpenSection] = useState<
    CalendarSecondarySection | null
  >(() =>
    hadMultipleReminderOffsets || reminderScheduleInvalid
      ? "reminders"
      : null,
  );
  const [acknowledgedValidationVersion, setAcknowledgedValidationVersion] =
    useState(state.version);
  const validationOpenSection: CalendarSecondarySection | null =
    normalizedError.includes("start time") ||
    normalizedError.includes("due time")
      ? "time"
      : normalizedError.includes("duration")
      ? "duration"
      : normalizedError.includes("reminder")
        ? "reminders"
        : normalizedError.includes("repeat") ||
            normalizedError.includes("recurrence")
          ? "repeats"
          : normalizedError.includes("detail")
            ? "details"
            : null;
  const expandedSection =
    state.version !== acknowledgedValidationVersion
      ? validationOpenSection ?? openSection
      : openSection;
  const recurrenceSummary =
    recurrenceChoice === "custom" && recurrenceDraftValidation
      ? "Check recurrence"
      : formatRecurrenceSummary(recurrenceForScheduling, localDate);
  const isRecurringCommitment = Boolean(
    commitment && commitment.recurrence !== "none",
  );
  const formTitle = isRecurringCommitment
    ? "Update recurring commitment"
    : commitment
      ? "Edit commitment"
      : initialType === "deadline"
        ? "Add standalone deadline"
        : initialType === "event"
          ? "Add event"
          : "Add commitment";
  const formSubtitle = isRecurringCommitment
    ? "Changes apply to the whole recurring commitment."
    : commitment
      ? "Update this commitment's details."
      : "Add something fixed or time-sensitive.";

  const setSectionExpanded = (
    section: CalendarSecondarySection,
    expanded: boolean,
  ) => {
    setAcknowledgedValidationVersion(state.version);
    setOpenSection((current) =>
      resolveSecondarySettingExpansion(current, section, expanded),
    );
  };

  const changeLocalDate = (nextDate: string) => {
    const currentAnchorWeekday = getIsoWeekday(localDate);
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(nextDate) &&
      recurrenceRule.unit === "week" &&
      recurrenceRule.weekdays.length === 1 &&
      recurrenceRule.weekdays[0] === currentAnchorWeekday
    ) {
      setRecurrenceRule({
        ...recurrenceRule,
        weekdays: [getIsoWeekday(nextDate)],
      });
    }
    setLocalDate(nextDate);
  };

  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, state.version, onSaved]);

  const transitionReminders = (
    nextType: "event" | "deadline",
    nextNoExactTime: boolean,
  ) => {
    const nextKind = getReminderCommitmentKind(
      nextType,
      nextType === "event" || !nextNoExactTime,
    );
    setReminderOffsets((current) =>
      !commitment && !remindersTouched
        ? getDefaultAvailableReminderOffsets(nextKind, {
            occurrenceDate: localDate,
            wallClockTime:
              nextKind === "event"
                ? eventStartTime
                : nextKind === "timed_deadline"
                  ? deadlineDueTime
                  : null,
            timezone,
            now,
            recurrence,
            recurrenceRule: recurrenceForScheduling,
          })
        : normalizeSingleReminderOffsets(current, nextKind),
    );
  };

  return (
    <form
      action={action}
      className="w-full min-w-0 max-w-full space-y-5 rounded-2xl border border-border bg-card p-5 text-foreground"
    >
      {commitment && (
        <input type="hidden" name="commitmentId" value={commitment.id} />
      )}
      <ClarityFormHeader
        title={formTitle}
        subtitle={formSubtitle}
        closeLabel="Close commitment form"
        onClose={onCancel}
      />

      <fieldset className="min-w-0 space-y-2">
        <legend className="sr-only">Commitment kind</legend>
        <input type="hidden" name="commitmentType" value={type} />
        {kindOpen ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">What are you adding?</p>
            <div className="grid min-w-0 gap-2">
              {(["event", "deadline"] as const).map((value) => {
                const presentation = getCommitmentKindPresentation(value);
                const selected = type === value;

                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setType(value);
                      transitionReminders(value, noExactTime);
                      setKindOpen(false);
                    }}
                    className={`flex min-h-14 w-full min-w-0 items-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-ring bg-secondary"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {presentation.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {presentation.choiceDescription}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded="false"
            onClick={() => setKindOpen(true)}
            className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
              {getCommitmentKindPresentation(type).summary}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </fieldset>

      <Field label="What is it?" htmlFor="commitment-title">
        <Input
          id="commitment-title"
          name="title"
          defaultValue={commitment?.title ?? ""}
          maxLength={200}
          required
          className="h-12 rounded-xl"
        />
      </Field>

      {type === "event" ? (
        <>
          <Field label="Date" htmlFor="event-date">
            <Input
              id="event-date"
              type="date"
              name="localDate"
              value={localDate}
              onChange={(event) => changeLocalDate(event.target.value)}
              required
              className="h-12 rounded-xl"
            />
          </Field>
          <TimeSelector
            key="event-time"
            name="eventStartTime"
            label="Start time"
            summary={formatCommitmentTime(eventStartTime) ?? "Choose time"}
            value={eventStartTime}
            onChange={setEventStartTime}
            error={validationOpenSection === "time" ? state.error ?? undefined : undefined}
          />
        </>
      ) : (
        <>
          <Field label="Due date" htmlFor="deadline-date">
            <Input
              id="deadline-date"
              type="date"
              name="localDate"
              value={localDate}
              onChange={(event) => changeLocalDate(event.target.value)}
              required
              className="h-12 rounded-xl"
            />
          </Field>
          {!noExactTime && (
            <TimeSelector
              key="deadline-time"
              name="deadlineDueTime"
              label="Due time"
              value={deadlineDueTime}
              onChange={setDeadlineDueTime}
              expanded={expandedSection === "time"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("time", expanded)
              }
              error={validationOpenSection === "time" ? state.error ?? undefined : undefined}
            />
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
            <Checkbox
              name="noExactTime"
              checked={noExactTime}
              onCheckedChange={(checked) => {
                const nextNoExactTime = checked === true;
                setNoExactTime(nextNoExactTime);
                transitionReminders(type, nextNoExactTime);
                if (nextNoExactTime && expandedSection === "time") {
                  setSectionExpanded("time", false);
                }
              }}
            />
            No exact time
          </label>
        </>
      )}

      <SecondarySettingStack>
        {type === "event" && (
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Duration</legend>
            <input type="hidden" name="durationHours" value={durationHours} />
            <input
              type="hidden"
              name="durationMinutes"
              value={durationMinutes}
            />
            <SecondarySettingDisclosure
              icon={Timer}
              label="Duration"
              summary={formatEventDurationSummary(
                durationHours,
                durationMinutes,
              )}
              expanded={expandedSection === "duration"}
              onExpandedChange={(expanded) =>
                setSectionExpanded("duration", expanded)
              }
            >
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <Field label="Hours" htmlFor="duration-hours">
                  <span className="relative block min-w-0">
                    <Input
                      id="duration-hours"
                      type="number"
                      min="0"
                      max="24"
                      step="1"
                      inputMode="numeric"
                      value={durationHours}
                      onChange={(event) => setDurationHours(event.target.value)}
                      className="duration-number-input h-12 w-full min-w-0 max-w-full rounded-xl pr-9"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">h</span>
                  </span>
                </Field>
                <Field label="Minutes" htmlFor="duration-minutes">
                  <span className="relative block min-w-0">
                    <Input
                      id="duration-minutes"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      inputMode="numeric"
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(event.target.value)}
                      className="duration-number-input h-12 w-full min-w-0 max-w-full rounded-xl pr-9"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">m</span>
                  </span>
                </Field>
              </div>
            </SecondarySettingDisclosure>
          </fieldset>
        )}

        <CalendarReminderField
          kind={reminderKind}
          offsets={effectiveReminderOffsets}
          scheduleContext={reminderScheduleContext}
          expanded={expandedSection === "reminders"}
          onExpandedChange={(expanded) =>
            setSectionExpanded("reminders", expanded)
          }
          legacyMultipleNotice={hadMultipleReminderOffsets}
          onChange={(offsets) => {
            setRemindersTouched(true);
            setReminderOffsets(offsets);
          }}
        />

        <DetailsControl
          name="details"
          value={details}
          onChange={setDetails}
          maxLength={2000}
          placeholder="Location, preparation needed, submission link, or useful details."
          expanded={expandedSection === "details"}
          onExpandedChange={(expanded) =>
            setSectionExpanded("details", expanded)
          }
        />

        <div className="min-w-0">
          <input type="hidden" name="recurrence" value={recurrence} />
          <input type="hidden" name="recurrenceUnit" value={recurrenceRule.unit ?? ""} />
          <input type="hidden" name="recurrenceInterval" value={recurrenceInterval} />
          {recurrenceRule.weekdays.map((weekday) => (
            <input key={weekday} type="hidden" name="recurrenceWeekdays" value={weekday} />
          ))}
          <RecurrenceControl
            expanded={expandedSection === "repeats"}
            summary={recurrenceSummary}
            value={recurrenceChoice}
            choices={calendarRecurrenceChoices}
            onExpandedChange={(expanded) =>
              setSectionExpanded("repeats", expanded)
            }
            onChange={(choice) => {
              const next = resolveCalendarRecurrencePrimaryChoice(
                choice,
                recurrenceForScheduling,
                localDate,
              );
              setRecurrenceChoice(choice);
              setRecurrenceDraftError(null);
              setRecurrenceRule(next);
              setRecurrenceInterval(String(next.interval));
            }}
            onDone={() => {
              if (recurrenceChoice === "custom" && recurrenceDraftValidation) {
                setRecurrenceDraftError(recurrenceDraftValidation);
                return;
              }
              setRecurrenceDraftError(null);
              if (recurrenceChoice === "custom") {
                setRecurrenceRule(recurrenceDraftRule);
              }
              setSectionExpanded("repeats", false);
            }}
          >
            <CalendarCustomRecurrenceEditor
              localDate={localDate}
              rule={recurrenceRule}
              intervalValue={recurrenceInterval}
              onIntervalChange={(value) => {
                if (/^\d*$/.test(value)) {
                  setRecurrenceInterval(value);
                  setRecurrenceDraftError(null);
                }
              }}
              onRuleChange={setRecurrenceRule}
              error={recurrenceDraftError}
            />
          </RecurrenceControl>
        </div>
      </SecondarySettingStack>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <PendingButton
        type="submit"
        size="lg"
        pendingLabel="Saving…"
        className="h-12 w-full rounded-xl text-base"
      >
        {!commitment && <Plus />}
        {commitment
          ? "Save changes"
          : type === "event"
            ? "Add event"
            : "Add deadline"}
      </PendingButton>
    </form>
  );
}

const calendarRecurrenceChoices = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
] as const;

const calendarWeekdays = [
  { value: 1, label: "M", name: "Monday" },
  { value: 2, label: "T", name: "Tuesday" },
  { value: 3, label: "W", name: "Wednesday" },
  { value: 4, label: "T", name: "Thursday" },
  { value: 5, label: "F", name: "Friday" },
  { value: 6, label: "S", name: "Saturday" },
  { value: 7, label: "S", name: "Sunday" },
] as const;

function CalendarCustomRecurrenceEditor({
  localDate,
  rule,
  intervalValue,
  onIntervalChange,
  onRuleChange,
  error,
}: {
  localDate: string;
  rule: CalendarRecurrenceRule;
  intervalValue: string;
  onIntervalChange: (value: string) => void;
  onRuleChange: (rule: CalendarRecurrenceRule) => void;
  error: string | null;
}) {
  const unit = rule.unit ?? "week";
  const weekdays = unit === "week" && rule.weekdays.length > 0
    ? rule.weekdays
    : [getIsoWeekday(localDate)];

  function setUnit(nextUnit: CalendarRecurrenceUnit) {
    onRuleChange({
      ...rule,
      unit: nextUnit,
      weekdays: nextUnit === "week" ? weekdays : [],
    });
  }

  function toggleWeekday(weekday: number) {
    onRuleChange({
      ...rule,
      unit: "week",
      weekdays: weekdays.includes(weekday)
        ? weekdays.filter((value) => value !== weekday)
        : [...weekdays, weekday].sort((left, right) => left - right),
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium">Repeat every</p>
      <div className="grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
        <Input
          type="number"
          min="1"
          max="999"
          step="1"
          inputMode="numeric"
          aria-label="Repeat interval"
          value={intervalValue}
          onChange={(event) => onIntervalChange(event.currentTarget.value)}
          onKeyDown={(event) => event.stopPropagation()}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "calendar-recurrence-error" : undefined}
          className="h-11 min-w-0"
        />
        <select
          aria-label="Repeat unit"
          value={unit}
          onChange={(event) => setUnit(event.currentTarget.value as CalendarRecurrenceUnit)}
          className="h-11 min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="day">days</option>
          <option value="week">weeks</option>
          <option value="month">months</option>
          <option value="year">years</option>
        </select>
      </div>
      {unit === "week" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Repeat on</p>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarWeekdays.map((weekday) => {
              const selected = weekdays.includes(weekday.value);
              return (
                <button
                  key={weekday.value}
                  type="button"
                  aria-label={weekday.name}
                  aria-pressed={selected}
                  onClick={() => toggleWeekday(weekday.value)}
                  className={`flex aspect-square min-w-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    selected
                      ? "border-ring bg-secondary text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {weekday.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <p id="calendar-recurrence-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
