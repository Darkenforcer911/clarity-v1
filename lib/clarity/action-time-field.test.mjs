import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasOptionalActionTime,
  resolveActionTimingFromOptionalTime,
} from "./action-time-field.ts";
import {
  formatActionRecurrenceSummary,
  getActionRecurrencePrimaryChoice,
  resolveActionRecurrencePrimaryChoice,
} from "./action-recurrence.ts";
import { formatCommitmentTime } from "./calendar-rules.ts";

const actionFieldsSource = readFileSync(
  new URL("../../components/clarity/action-fields.tsx", import.meta.url),
  "utf8",
);
const timeSelectorSource = readFileSync(
  new URL("../../components/clarity/time-selector.tsx", import.meta.url),
  "utf8",
);
const addActionSource = readFileSync(
  new URL("../../components/clarity/add-action-form.tsx", import.meta.url),
  "utf8",
);
const proposedActionSource = readFileSync(
  new URL("../../components/clarity/proposed-action-card.tsx", import.meta.url),
  "utf8",
);
const changeTimeSource = readFileSync(
  new URL("../../components/clarity/change-action-time-form.tsx", import.meta.url),
  "utf8",
);
const workspaceServiceSource = readFileSync(
  new URL("./action-workspace-service.ts", import.meta.url),
  "utf8",
);
const calendarFormSource = readFileSync(
  new URL("../../components/clarity/calendar-commitment-form.tsx", import.meta.url),
  "utf8",
);
const recurrenceControlSource = readFileSync(
  new URL("../../components/clarity/recurrence-control.tsx", import.meta.url),
  "utf8",
);
const secondarySettingSource = readFileSync(
  new URL(
    "../../components/clarity/secondary-setting-disclosure.tsx",
    import.meta.url,
  ),
  "utf8",
);
const timeSpentSource = readFileSync(
  new URL("../../components/clarity/time-spent-field.tsx", import.meta.url),
  "utf8",
);
const actionSchemasSource = readFileSync(
  new URL("./schemas.ts", import.meta.url),
  "utf8",
);
test("an empty action time maps to the existing flexible action state", () => {
  assert.deepEqual(resolveActionTimingFromOptionalTime(""), {
    actionType: "flexible",
    scheduledTime: "",
  });
  assert.deepEqual(resolveActionTimingFromOptionalTime("   "), {
    actionType: "flexible",
    scheduledTime: "",
  });
  assert.equal(hasOptionalActionTime(""), false);
});

test("a valid action time maps to the existing fixed action state", () => {
  assert.deepEqual(resolveActionTimingFromOptionalTime("16:00"), {
    actionType: "fixed",
    scheduledTime: "16:00",
  });
  assert.equal(hasOptionalActionTime("16:00"), true);
  assert.deepEqual(resolveActionTimingFromOptionalTime("18:15"), {
    actionType: "fixed",
    scheduledTime: "18:15",
  });
});

test("Action uses the compact shared Time row with Anytime when untimed", () => {
  assert.doesNotMatch(actionFieldsSource, /Time \(optional\)/);
  assert.match(actionFieldsSource, /<OptionalTimeSelector/);
  assert.match(timeSelectorSource, /<TimeSelector/);
  assert.match(
    timeSelectorSource,
    /summary=\{formatCommitmentTime\(value\) \?\? "Anytime"\}/,
  );
  assert.doesNotMatch(timeSelectorSource, /timeVisible|Add time/);
  assert.match(actionFieldsSource, /initialScheduledTime/);
  assert.match(
    timeSelectorSource,
    /value[\s\S]*onChange\(""\);[\s\S]*onExpandedChange\(false\)/,
  );
  assert.match(timeSelectorSource, /Remove time/);
});

test("timed Action summary uses the shared human-readable time formatter", () => {
  assert.equal(formatCommitmentTime("19:05"), "7:05 pm");
  assert.equal(formatCommitmentTime("07:05"), "7:05 am");
});

test("compact Action time changes only through the shared native input", () => {
  const optionalSelector = timeSelectorSource.slice(
    timeSelectorSource.indexOf("export function OptionalTimeSelector"),
    timeSelectorSource.indexOf("export function TimeSelector"),
  );
  assert.match(optionalSelector, /value=\{value\}/);
  assert.match(optionalSelector, /onChange=\{onChange\}/);
  assert.doesNotMatch(optionalSelector, /useState|defaultValue|onClick/);
  assert.match(
    timeSelectorSource,
    /type="time"[\s\S]*value=\{value\}[\s\S]*onChange=\{\(event\) => onChange\(event\.currentTarget\.value\)\}/,
  );
});

test("Action recurrence uses the compact Calendar-style summary without changing values", () => {
  assert.equal(formatActionRecurrenceSummary("none"), "Doesn't repeat");
  assert.equal(formatActionRecurrenceSummary("daily"), "Daily");
  assert.equal(formatActionRecurrenceSummary("weekly"), "Weekly");
  assert.equal(
    formatActionRecurrenceSummary("certain_days", [1, 3, 5]),
    "Mon, Wed, Fri",
  );
  assert.equal(getActionRecurrencePrimaryChoice("certain_days"), "custom");
  assert.equal(resolveActionRecurrencePrimaryChoice("custom"), "certain_days");
  assert.match(actionFieldsSource, /<RecurrenceControl/);
  assert.match(actionFieldsSource, /name="recurrencePattern"/);
  assert.match(actionFieldsSource, /name="recurrenceDays"/);
});

test("Weekly remains anchored to the Action date while Custom owns weekdays", () => {
  assert.equal(formatActionRecurrenceSummary("weekly", [1, 3]), "Weekly");
  assert.equal(resolveActionRecurrencePrimaryChoice("weekly"), "weekly");
  assert.equal(resolveActionRecurrencePrimaryChoice("custom"), "certain_days");
  assert.match(recurrenceControlSource, /value === "custom" && children/);
});

test("the shared recurrence control owns the common compact interaction", () => {
  for (const label of ["Doesn't repeat", "Daily", "Weekly", "Custom"]) {
    assert.match(recurrenceControlSource, new RegExp(label.replace("'", "\\'")));
  }
  assert.match(recurrenceControlSource, /icon=\{Repeat2\}/);
  assert.match(recurrenceControlSource, /label="Repeats"/);
  assert.match(recurrenceControlSource, /<SecondarySettingDisclosure/);
  assert.match(secondarySettingSource, /aria-expanded=\{expanded\}/);
  assert.match(secondarySettingSource, /onExpandedChange\(!expanded\)/);
  assert.match(secondarySettingSource, /\{expanded && \(/);
  assert.match(recurrenceControlSource, /value === "custom" && children/);
});

test("existing certain-day Actions reopen as Custom and retain compatible weekday values", () => {
  assert.equal(getActionRecurrencePrimaryChoice("certain_days"), "custom");
  assert.match(actionFieldsSource, /initialDays/);
  assert.match(actionFieldsSource, /useState\(initialDays\)/);

  assert.equal(resolveActionRecurrencePrimaryChoice("custom"), "certain_days");
  assert.match(
    actionSchemasSource,
    /recurrencePattern: z\.enum\(\["none", "daily", "weekly", "certain_days"\]\)/,
  );
  assert.match(
    actionSchemasSource,
    /value\.recurrencePattern === "certain_days"[\s\S]*value\.recurrenceDays\.length === 0/,
  );
});

test("create and proposed-edit flows share ActionFields", () => {
  assert.match(addActionSource, /<ActionFields/);
  assert.match(proposedActionSource, /<ActionFields/);
});

test("Add Action renders the universal compact Action fields", () => {
  const actionFieldsRender = actionFieldsSource.slice(
    actionFieldsSource.indexOf("export function ActionFields"),
    actionFieldsSource.indexOf("export function OptionalActionTimeField"),
  );
  const titlePosition = actionFieldsRender.indexOf('label="What"');
  const timePosition = actionFieldsRender.indexOf("<ActionTimeField");
  const durationPosition = actionFieldsRender.indexOf("<DurationFields");
  const duePosition = actionFieldsRender.indexOf("<ActionDueField");
  const repeatsPosition = actionFieldsRender.indexOf("<RecurrenceFields");
  const remindersPosition = actionFieldsRender.indexOf("<CalendarReminderField");
  const detailsPosition = actionFieldsRender.indexOf("<DetailsControl");
  assert.ok(titlePosition >= 0);
  assert.ok(timePosition > titlePosition);
  assert.ok(durationPosition > timePosition);
  assert.ok(duePosition > durationPosition);
  assert.ok(repeatsPosition > duePosition);
  assert.ok(remindersPosition > repeatsPosition);
  assert.ok(detailsPosition > remindersPosition);
  assert.match(addActionSource, /showRecurrence/);
  assert.match(addActionSource, />\s*Add action\s*<\/PendingButton>/);
});

test("Duration, Details, and Repeats are direct collapsed accordion controls", () => {
  assert.doesNotMatch(actionFieldsSource, /label="More options"/);
  assert.doesNotMatch(actionFieldsSource, /moreOptionsOpen|keepMounted/);
  assert.match(actionFieldsSource, /expanded=\{openSection === "duration"\}/);
  assert.match(actionFieldsSource, /expanded=\{openSection === "details"\}/);
  assert.match(actionFieldsSource, /expanded=\{openSection === "repeats"\}/);
  assert.match(actionFieldsSource, /initialValues\.estimatedMinutes \?\? 30/);
});

test("planned and completed Duration use one compact friendly input", () => {
  assert.match(actionFieldsSource, /function CompletedDurationField[\s\S]*<TimeSpentField/);
  assert.match(actionFieldsSource, /export function DurationFields[\s\S]*<TimeSpentField/);
  assert.match(timeSpentSource, /placeholder="45m or 1h 30m"/);
  assert.match(timeSpentSource, /parseDurationInput/);
  assert.doesNotMatch(timeSpentSource, /const choices|aria-pressed|15m|Custom time spent/);
  assert.doesNotMatch(actionFieldsSource, /Hours[\s\S]*Minutes/);
});

test("Due stays compact and contains optional native controls on narrow screens", () => {
  const dueField = actionFieldsSource.slice(
    actionFieldsSource.indexOf("function ActionDueField"),
    actionFieldsSource.indexOf("export function DurationFields"),
  );
  assert.match(dueField, /summary = dueLocalDate/);
  assert.match(dueField, /formatActionDueDate/);
  assert.match(dueField, /type="date"/);
  assert.match(dueField, /\{dueLocalDate && \([\s\S]*Optional time[\s\S]*type="time"/);
  assert.match(dueField, /w-full min-w-0 max-w-full/);
  assert.match(dueField, /\[min-inline-size:0\]/);
});

test("completed standalone Actions hide reminders until Repeats is enabled", () => {
  assert.match(
    actionFieldsSource,
    /showReminders &&[\s\S]*\(mode === "planned" \|\| recurrencePattern !== "none"\)/,
  );
});

test("active action editing reuses the same optional-time control", () => {
  assert.match(changeTimeSource, /OptionalActionTimeField/);
  assert.doesNotMatch(changeTimeSource, /function TimingChoice/);
});

test("Today action forms no longer render the binary timing selector", () => {
  for (const source of [actionFieldsSource, changeTimeSource]) {
    assert.doesNotMatch(source, /Anytime today/);
    assert.doesNotMatch(source, /At a specific time/);
    assert.doesNotMatch(source, /function TimingChoice/);
  }
});

test("past-time safeguards remain tied to the canonical fixed action", () => {
  assert.match(workspaceServiceSource, /input\.actionType !== "fixed"/);
  assert.match(workspaceServiceSource, /That time has already passed/);
  assert.match(workspaceServiceSource, /Choose a later time or remove the time/);
});

test("Calendar commitment time controls use the same shared selector", () => {
  assert.match(calendarFormSource, /<TimeSelector/);
  assert.match(calendarFormSource, /eventStartTime/);
  assert.match(calendarFormSource, /deadlineDueTime/);
});
