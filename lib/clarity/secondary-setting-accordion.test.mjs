import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveSecondarySettingExpansion } from "./secondary-setting-accordion.ts";

const calendarFormSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-commitment-form.tsx",
    import.meta.url,
  ),
  "utf8",
);
const actionFieldsSource = readFileSync(
  new URL("../../components/clarity/action-fields.tsx", import.meta.url),
  "utf8",
);
const reminderSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-reminder-field.tsx",
    import.meta.url,
  ),
  "utf8",
);
const disclosureSource = readFileSync(
  new URL(
    "../../components/clarity/secondary-setting-disclosure.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("opening Duration closes Repeats", () => {
  assert.equal(
    resolveSecondarySettingExpansion("repeats", "duration", true),
    "duration",
  );
});

test("opening Reminders closes Duration", () => {
  assert.equal(
    resolveSecondarySettingExpansion("duration", "reminders", true),
    "reminders",
  );
});

test("opening Details closes Reminders", () => {
  assert.equal(
    resolveSecondarySettingExpansion("reminders", "details", true),
    "details",
  );
});

test("tapping the open section collapses it", () => {
  assert.equal(
    resolveSecondarySettingExpansion("details", "details", false),
    null,
  );
});

test("Calendar owns one open state for all secondary sections", () => {
  for (const section of ["time", "duration", "reminders", "repeats", "details"]) {
    assert.match(
      calendarFormSource,
      new RegExp(`expandedSection === "${section}"`),
    );
  }
  assert.match(calendarFormSource, /setSectionExpanded/);
  assert.match(calendarFormSource, /resolveSecondarySettingExpansion/);
});

test("Action owns one open state for Time and direct secondary disclosures", () => {
  assert.match(actionFieldsSource, /"time" \| "duration" \| "details" \| "repeats" \| null/);
  assert.match(actionFieldsSource, /openSection === "time"/);
  assert.match(actionFieldsSource, /openSection === "details"/);
  assert.match(actionFieldsSource, /openSection === "repeats"/);
  assert.match(actionFieldsSource, /openSection === "duration"/);
  assert.match(actionFieldsSource, /resolveSecondarySettingExpansion/);
});

test("Action secondary disclosures are direct and mutually exclusive", () => {
  assert.doesNotMatch(actionFieldsSource, /label="More options"/);
  assert.equal(
    resolveSecondarySettingExpansion("duration", "details", true),
    "details",
  );
  assert.equal(
    resolveSecondarySettingExpansion("details", "repeats", true),
    "repeats",
  );
  assert.equal(
    resolveSecondarySettingExpansion("repeats", "duration", true),
    "duration",
  );
});

test("controlled values survive automatic collapse and reopen", () => {
  assert.match(calendarFormSource, /value=\{durationHours\}/);
  assert.match(calendarFormSource, /value=\{durationMinutes\}/);
  assert.match(calendarFormSource, /offsets=\{effectiveReminderOffsets\}/);
  assert.match(calendarFormSource, /value=\{recurrence\}/);
  assert.match(calendarFormSource, /value=\{details\}/);
  assert.match(actionFieldsSource, /value=\{context\}/);
  assert.match(actionFieldsSource, /useState\(initialDays\)/);
  assert.match(actionFieldsSource, /value=\{scheduledTime\}/);
});

test("opening Repeats closes Time", () => {
  assert.equal(
    resolveSecondarySettingExpansion("time", "repeats", true),
    "repeats",
  );
});

test("Done collapses without submitting the parent form", () => {
  assert.match(
    disclosureSource,
    /type="button"[\s\S]*onClick=\{onDone \?\? \(\(\) => onExpandedChange\(false\)\)\}[\s\S]*Done/,
  );
  assert.match(
    reminderSource,
    /type="button"[\s\S]*onClick=\{handleDone\}[\s\S]*Done/,
  );
  assert.doesNotMatch(disclosureSource, /type="submit"/);
});
