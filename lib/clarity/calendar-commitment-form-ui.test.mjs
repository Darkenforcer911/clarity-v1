import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatEventDurationSummary,
  formatRecurrenceSummary,
  formatReminderSummary,
  getCalendarRecurrencePrimaryChoice,
  getCommitmentKindPresentation,
  resolveCalendarRecurrencePrimaryChoice,
} from "./calendar-commitment-form-ui.ts";

const formSource = readFileSync(
  new URL("../../components/clarity/calendar-commitment-form.tsx", import.meta.url),
  "utf8",
);
const reminderSource = readFileSync(
  new URL("../../components/clarity/calendar-reminder-field.tsx", import.meta.url),
  "utf8",
);
const calendarFormParserSource = readFileSync(
  new URL("./calendar-form.ts", import.meta.url),
  "utf8",
);
const calendarServiceSource = readFileSync(
  new URL("./calendar-service.ts", import.meta.url),
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
const detailsControlSource = readFileSync(
  new URL("../../components/clarity/details-control.tsx", import.meta.url),
  "utf8",
);
const formHeaderSource = readFileSync(
  new URL("../../components/clarity/clarity-form-header.tsx", import.meta.url),
  "utf8",
);

test("reminder summaries cover presets, custom offsets, and no reminder", () => {
  assert.equal(formatReminderSummary([0]), "At start time");
  assert.equal(formatReminderSummary([120]), "2 hours before");
  assert.equal(formatReminderSummary([30]), "30 min before");
  assert.equal(formatReminderSummary([5]), "5 minutes before");
  assert.equal(formatReminderSummary([1]), "1 minute before");
  assert.equal(formatReminderSummary([608]), "10 hr 8 min before");
  assert.equal(formatReminderSummary([]), "None");
});

test("commitment-kind choices explain Event and Deadline", () => {
  assert.deepEqual(getCommitmentKindPresentation("event"), {
    label: "Event",
    choiceDescription: "Something that happens at a specific time",
    summary: "Event · happens at a set time",
  });
  assert.deepEqual(getCommitmentKindPresentation("deadline"), {
    label: "Deadline",
    choiceDescription: "Something that must be done by a date or time",
    summary: "Deadline · due by a date/time",
  });
});

test("the selected kind collapses to one descriptive reopening control", () => {
  assert.match(formSource, /const \[kindOpen, setKindOpen\] = useState\(!commitment\)/);
  assert.match(formSource, /getCommitmentKindPresentation\(type\)\.summary/);
  assert.match(formSource, /onClick=\{\(\) => setKindOpen\(true\)\}/);
  assert.match(formSource, /setKindOpen\(false\)/);
});

test("kind changes retain existing Event and Deadline form semantics", () => {
  assert.match(formSource, /transitionReminders\(value, noExactTime\)/);
  assert.match(formSource, /name="eventStartTime"/);
  assert.match(formSource, /name="durationHours"/);
  assert.match(formSource, /name="deadlineDueTime"/);
  assert.match(formSource, /name="noExactTime"/);
  assert.match(formSource, /name="commitmentType" value=\{type\}/);
});

test("the compact selector does not introduce redundant Type copy", () => {
  assert.doesNotMatch(formSource, /<legend[^>]*>Type<\/legend>/);
  assert.doesNotMatch(formSource, /Type\s*[→>]/);
});

test("Event duration summaries cover empty and saved durations", () => {
  assert.equal(formatEventDurationSummary("0", "0"), "Not set");
  assert.equal(formatEventDurationSummary("", ""), "Not set");
  assert.equal(formatEventDurationSummary("0", "45"), "45 min");
  assert.equal(formatEventDurationSummary("1", "0"), "1 hr");
  assert.equal(formatEventDurationSummary("1", "30"), "1 hr 30 min");
});

test("Event duration expands inline and retains controlled unsaved values", () => {
  assert.match(formSource, /label="Duration"/);
  assert.doesNotMatch(formSource, /Duration \(optional\)/);
  assert.match(formSource, /commitment \? commitment\.duration_minutes \?\? 0 : 30/);
  assert.match(formSource, /<SecondarySettingDisclosure/);
  assert.match(formSource, /expanded=\{expandedSection === "duration"\}/);
  assert.match(
    formSource,
    /type="hidden" name="durationHours" value=\{durationHours\}/,
  );
  assert.match(formSource, /name="durationMinutes"/);
  assert.match(formSource, /value=\{durationMinutes\}/);
});

test("recurrence summaries use concise commitment language", () => {
  assert.equal(formatRecurrenceSummary(
    { unit: null, interval: 1, weekdays: [] },
    "2026-08-17",
  ), "Doesn't repeat");
  assert.equal(formatRecurrenceSummary(
    { unit: "day", interval: 1, weekdays: [] },
    "2026-08-17",
  ), "Daily");
  assert.equal(formatRecurrenceSummary(
    { unit: "week", interval: 1, weekdays: [1] },
    "2026-08-17",
  ), "Weekly");
  assert.equal(formatRecurrenceSummary(
    { unit: "week", interval: 2, weekdays: [1] },
    "2026-08-17",
  ), "Every 2 weeks · Mon");
  assert.equal(formatRecurrenceSummary(
    { unit: "month", interval: 1, weekdays: [] },
    "2026-08-17",
  ), "Monthly");
  assert.equal(formatRecurrenceSummary(
    { unit: "year", interval: 1, weekdays: [] },
    "2026-08-17",
  ), "Yearly");
});

test("Calendar uses the shared compact recurrence control without a native select", () => {
  assert.match(formSource, /<RecurrenceControl/);
  assert.match(recurrenceControlSource, /<SecondarySettingDisclosure/);
  assert.match(secondarySettingSource, /aria-expanded=\{expanded\}/);
  assert.match(secondarySettingSource, /onExpandedChange\(!expanded\)/);
  assert.doesNotMatch(formSource, /<select[^>]*commitment-recurrence/);
  assert.match(formSource, /\{ value: "monthly", label: "Monthly" \}/);
  assert.match(formSource, /\{ value: "yearly", label: "Yearly" \}/);
  assert.match(formSource, /<CalendarCustomRecurrenceEditor/);
  assert.doesNotMatch(formSource, /Every 1 month/);
});

test("existing fortnightly and monthly commitments reopen with compatible choices", () => {
  assert.equal(getCalendarRecurrencePrimaryChoice(
    { unit: "week", interval: 2, weekdays: [1] },
    "2026-08-17",
  ), "custom");
  assert.equal(getCalendarRecurrencePrimaryChoice(
    { unit: "month", interval: 1, weekdays: [] },
    "2026-08-17",
  ), "monthly");
  assert.equal(
    resolveCalendarRecurrencePrimaryChoice(
      "custom",
      { unit: "week", interval: 2, weekdays: [1] },
      "2026-08-17",
    ).interval,
    2,
  );
  assert.equal(
    resolveCalendarRecurrencePrimaryChoice(
      "monthly",
      { unit: "week", interval: 2, weekdays: [1] },
      "2026-08-17",
    ).unit,
    "month",
  );
});

test("Custom recurrence mode survives a temporarily invalid interval draft", () => {
  assert.match(formSource, /const \[recurrenceChoice, setRecurrenceChoice\] = useState/);
  assert.match(formSource, /value=\{recurrenceChoice\}/);
  assert.doesNotMatch(
    formSource,
    /value=\{getCalendarRecurrencePrimaryChoice\(recurrenceForScheduling/,
  );
  assert.match(
    formSource,
    /onIntervalChange=\{\(value\) => \{[\s\S]*setRecurrenceInterval\(value\)[\s\S]*setRecurrenceDraftError\(null\)/,
  );
  assert.match(formSource, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
});

test("Custom Done validates before committing or collapsing", () => {
  assert.match(
    formSource,
    /recurrenceChoice === "custom" && recurrenceDraftValidation[\s\S]*setRecurrenceDraftError\(recurrenceDraftValidation\);[\s\S]*return;/,
  );
  assert.match(
    formSource,
    /setRecurrenceRule\(recurrenceDraftRule\);[\s\S]*setSectionExpanded\("repeats", false\)/,
  );
  assert.match(recurrenceControlSource, /onDone=\{onDone\}/);
  assert.match(secondarySettingSource, /onClick=\{onDone \?\?/);
});

test("Calendar recurrence controls submit existing backend-compatible values", () => {
  assert.match(
    calendarFormParserSource,
    /recurrence: z\.enum\(calendarRecurrencePresets\)/,
  );
  assert.match(calendarFormParserSource, /recurrenceUnit:/);
  assert.match(calendarFormParserSource, /recurrenceInterval:/);
  assert.match(calendarFormParserSource, /recurrenceWeekdays:/);
  assert.match(
    calendarFormParserSource,
    /getLegacyCalendarRecurrencePreset/,
  );
  assert.match(formSource, /name="recurrence" value=\{recurrence\}/);
});

test("Calendar form closes through the top-right X and has no bottom Cancel", () => {
  assert.match(formSource, /closeLabel="Close commitment form"/);
  assert.match(formSource, /onClose=\{onCancel\}/);
  assert.match(formHeaderSource, /aria-label=\{closeLabel\}/);
  assert.match(formHeaderSource, /onClick=\{onClose\}/);
  assert.doesNotMatch(formSource, />\s*Cancel\s*</);
});

test("custom reminder controls render only after Custom is selected", () => {
  assert.match(reminderSource, /aria-expanded=\{customOpen\}/);
  assert.match(reminderSource, /\{customOpen && \(/);
  assert.match(reminderSource, /aria-label="Custom reminder amount"/);
  assert.doesNotMatch(reminderSource, /Add custom reminder/);
  assert.doesNotMatch(reminderSource, /<Plus/);
});

test("preset buttons replace the canonical reminder selection", () => {
  assert.match(
    reminderSource,
    /onChange\(selectSingleReminderOffset\(offset\)\)/,
  );
  assert.match(reminderSource, /const selected = !customOpen && selectedOffset === offset/);
});

test("Done commits a valid custom reminder and retains invalid input", () => {
  assert.match(reminderSource, /const handleDone = \(\) =>/);
  assert.match(
    reminderSource,
    /onChange\(selectSingleReminderOffset\(minutes\)\);[\s\S]*onExpandedChange\(false\)/,
  );
  assert.match(
    reminderSource,
    /setCustomError\([\s\S]*return;/,
  );
  assert.doesNotMatch(reminderSource, /setCustomAmount\(""\)/);
});

test("impossible presets and invalid custom reminder instants stay unavailable", () => {
  assert.match(reminderSource, /disabled=\{!available\}/);
  assert.match(reminderSource, /REMINDER_TIME_PASSED_ERROR/);
  assert.match(reminderSource, /max=[\s\S]*"59"[\s\S]*"23"[\s\S]*"30"/);
  assert.match(formSource, /getDefaultAvailableReminderOffsets/);
});

test("the authenticated service validates the final notification instant", () => {
  assert.match(calendarServiceSource, /assertReminderScheduleIsFuture/);
  assert.match(calendarServiceSource, /profile\.timezone/);
  assert.match(calendarServiceSource, /validateReminderSchedule/);
});

test("Clear reminders produces none and submission is capped at one offset", () => {
  assert.match(reminderSource, /onChange\(\[\]\);[\s\S]*setCustomOpen\(false\)/);
  assert.match(calendarFormParserSource, /validateReminderOffsets\(/);
  assert.match(
    reminderSource,
    /type="hidden" name="reminderOffsets" value=\{offset\}/,
  );
  assert.match(reminderSource, /Clear reminder/);
});

test("collapsed sections retain canonical controlled form values", () => {
  assert.match(
    reminderSource,
    /type="hidden" name="reminderOffsets" value=\{offset\}/,
  );
  assert.match(
    formSource,
    /type="hidden" name="recurrence" value=\{recurrence\}/,
  );
  assert.match(formSource, /<DetailsControl/);
  assert.match(formSource, /name="details"/);
  assert.match(detailsControlSource, /type="hidden" name=\{name\} value=\{value\}/);
  assert.match(detailsControlSource, /value=\{value\}/);
});
