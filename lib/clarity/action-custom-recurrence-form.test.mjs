import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatActionRecurrenceSummary,
  getActionRecurrenceDaysForSubmission,
} from "./action-recurrence.ts";

const actionFieldsSource = readFileSync(
  new URL("../../components/clarity/action-fields.tsx", import.meta.url),
  "utf8",
);
const addActionSource = readFileSync(
  new URL("../../components/clarity/add-action-form.tsx", import.meta.url),
  "utf8",
);
const calendarAgendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const completedSource = readFileSync(
  new URL("../../components/clarity/so-far-today.tsx", import.meta.url),
  "utf8",
);
const reconciliationActionsSource = readFileSync(
  new URL("../../app/(app)/today/reconciliation-actions.ts", import.meta.url),
  "utf8",
);
const schemaSource = readFileSync(
  new URL("./schemas.ts", import.meta.url),
  "utf8",
);

test("Custom recurrence with Friday submits through the canonical Action schema", () => {
  const days = getActionRecurrenceDaysForSubmission("certain_days", [5]);

  assert.deepEqual(days, [5]);
  assert.equal(formatActionRecurrenceSummary("certain_days", days), "Fri");
  assert.match(
    schemaSource,
    /recurrenceDays: z\.array\(z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(6\)\)/,
  );
});

test("Custom recurrence submits multiple selected weekdays", () => {
  const days = getActionRecurrenceDaysForSubmission(
    "certain_days",
    [1, 3, 5],
  );
  assert.deepEqual(days, [1, 3, 5]);
  assert.equal(
    formatActionRecurrenceSummary("certain_days", days),
    "Mon, Wed, Fri",
  );
});

test("collapsed Repeats keeps selected weekdays in mounted hidden form controls", () => {
  const recurrenceStart = actionFieldsSource.indexOf("function RecurrenceFields");
  const recurrenceSource = actionFieldsSource.slice(recurrenceStart);
  const hiddenDays = recurrenceSource.indexOf(
    'type="hidden" name="recurrenceDays"',
  );
  const disclosure = recurrenceSource.indexOf("<RecurrenceControl");

  assert.ok(hiddenDays >= 0);
  assert.ok(hiddenDays < disclosure);
  assert.match(recurrenceSource, /useState\(initialDays\)/);
  assert.match(
    recurrenceSource,
    /formatActionRecurrenceSummary\(pattern, selectedDays\)/,
  );
  assert.doesNotMatch(
    recurrenceSource,
    /type="checkbox"[\s\S]{0,120}name="recurrenceDays"/,
  );
});

test("Daily and Doesn't repeat omit dormant Custom weekdays", () => {
  assert.deepEqual(
    getActionRecurrenceDaysForSubmission("daily", [5]),
    [],
  );
  assert.deepEqual(
    getActionRecurrenceDaysForSubmission("none", [5]),
    [],
  );
  assert.match(
    schemaSource,
    /value\.recurrencePattern !== "certain_days"[\s\S]*value\.recurrenceDays\.length > 0/,
  );
  assert.match(
    actionFieldsSource,
    /nextPattern !== "certain_days"\) setSelectedDays\(\[\]\)/,
  );
});

test("Custom recurrence still rejects an empty weekday selection", () => {
  assert.match(
    schemaSource,
    /value\.recurrencePattern === "certain_days"[\s\S]*value\.recurrenceDays\.length === 0[\s\S]*Choose at least one weekday\./,
  );
});

test("Shape Today and Calendar Add use the same corrected ActionFields form", () => {
  assert.match(addActionSource, /<ActionFields/);
  assert.match(addActionSource, /showRecurrence/);
  assert.match(calendarAgendaSource, /<AddActionForm/);
  assert.match(calendarAgendaSource, /destination="calendar"/);
});

test("the supported completed recurrence path uses the same fields and payload name", () => {
  assert.match(
    completedSource,
    /<ActionFields[\s\S]*mode="completed"/,
  );
  assert.match(
    reconciliationActionsSource,
    /recurrenceDays: formData\.getAll\("recurrenceDays"\)/,
  );
});
