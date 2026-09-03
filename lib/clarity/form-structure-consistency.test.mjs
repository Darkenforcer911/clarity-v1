import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const actionForm = source("../../components/clarity/add-action-form.tsx");
const actionFields = source("../../components/clarity/action-fields.tsx");
const calendarForm = source(
  "../../components/clarity/calendar-commitment-form.tsx",
);
const formHeader = source(
  "../../components/clarity/clarity-form-header.tsx",
);
const secondarySettings = source(
  "../../components/clarity/secondary-setting-disclosure.tsx",
);
const reminderField = source(
  "../../components/clarity/calendar-reminder-field.tsx",
);
const recurrenceControl = source(
  "../../components/clarity/recurrence-control.tsx",
);

test("Action and Calendar share the same visible form header", () => {
  assert.match(actionForm, /<ClarityFormHeader/);
  assert.match(calendarForm, /<ClarityFormHeader/);
  assert.match(formHeader, /items-center justify-between gap-3/);
  assert.match(formHeader, /text-sm font-semibold text-foreground/);
  assert.match(formHeader, /mt-1 text-sm text-muted-foreground/);
  assert.match(formHeader, /size-11 min-h-11 min-w-11 shrink-0 rounded-xl/);
});

test("Action and Calendar form shells use the same structural spacing", () => {
  for (const formSource of [actionForm, calendarForm]) {
    assert.match(
      formSource,
      /w-full min-w-0 max-w-full space-y-5 rounded-2xl border border-border bg-card p-5 text-foreground/,
    );
  }
});

test("Calendar primary fields match Action field height and radius", () => {
  assert.match(actionFields, /className="h-12 rounded-xl"/);
  assert.match(
    calendarForm,
    /id="commitment-title"[\s\S]*?className="h-12 rounded-xl"/,
  );
  assert.match(
    calendarForm,
    /id="event-date"[\s\S]*?className="h-12 rounded-xl"/,
  );
  assert.match(
    calendarForm,
    /id="deadline-date"[\s\S]*?className="h-12 rounded-xl"/,
  );
});

test("Calendar keeps shared secondary rows and matches the primary CTA", () => {
  assert.match(actionFields, /<SecondarySettingDisclosure/);
  assert.match(calendarForm, /<SecondarySettingDisclosure/);
  assert.match(actionForm, /className="h-12 w-full rounded-xl text-base"/);
  assert.match(calendarForm, /className="h-12 w-full rounded-xl text-base"/);
  assert.match(calendarForm, /\{!commitment && <Plus \/>\}/);
});

test("Action and Calendar use one shared secondary-settings gap", () => {
  assert.match(actionFields, /<SecondarySettingStack>/);
  assert.match(calendarForm, /<SecondarySettingStack>/);
  assert.match(secondarySettings, /data-slot="secondary-setting-stack"/);
  assert.match(
    secondarySettings,
    /grid w-full min-w-0 max-w-full gap-3 \[&>\*\]:m-0/,
  );
});

test("secondary row wrappers do not add sibling spacing", () => {
  assert.match(
    actionFields,
    /fieldset className="m-0 w-full min-w-0 max-w-full border-0 p-0"/,
  );
  assert.match(
    calendarForm,
    /fieldset className="m-0 min-w-0 border-0 p-0"/,
  );
  assert.match(
    reminderField,
    /fieldset className="m-0 min-w-0 border-0 p-0"/,
  );
  assert.match(
    recurrenceControl,
    /fieldset className="m-0 min-w-0 border-0 p-0"/,
  );
});

test("untimed Action has no trailing wrapper gap before secondary settings", () => {
  const optionalTime = actionFields.slice(
    actionFields.indexOf("export function ActionTimeField"),
    actionFields.indexOf("export function OptionalActionTimeField"),
  );
  assert.match(
    optionalTime,
    /<div className="w-full min-w-0 max-w-full">/,
  );
  assert.doesNotMatch(
    optionalTime,
    /<div className="w-full min-w-0 max-w-full space-y-/,
  );
});

test("Action uses the universal field order while Calendar retains its form order", () => {
  const actionStack = actionFields.slice(
    actionFields.indexOf("<SecondarySettingStack>"),
    actionFields.indexOf("</SecondarySettingStack>"),
  );
  assert.ok(actionStack.indexOf("<DurationFields") >= 0);
  assert.ok(
    actionStack.indexOf("<ActionDueField") >
      actionStack.indexOf("<DurationFields"),
  );
  assert.ok(
    actionStack.indexOf("<RecurrenceFields") >
      actionStack.indexOf("<ActionDueField"),
  );
  assert.ok(
    actionStack.indexOf("<CalendarReminderField") >
      actionStack.indexOf("<RecurrenceFields"),
  );
  assert.ok(
    actionStack.indexOf("<DetailsControl") >
      actionStack.indexOf("<CalendarReminderField"),
  );

  const calendarStack = calendarForm.slice(
    calendarForm.indexOf("<SecondarySettingStack>"),
    calendarForm.indexOf("</SecondarySettingStack>"),
  );
  assert.ok(calendarStack.indexOf('label="Duration"') >= 0);
  assert.ok(
    calendarStack.indexOf("<CalendarReminderField") >
      calendarStack.indexOf('label="Duration"'),
  );
  assert.ok(
    calendarStack.indexOf("<DetailsControl") >
      calendarStack.indexOf("<CalendarReminderField"),
  );
  assert.ok(
    calendarStack.indexOf("<RecurrenceControl") >
      calendarStack.indexOf("<DetailsControl"),
  );
});

test("new and edited commitments always receive a title and subtitle", () => {
  assert.match(
    calendarForm,
    /Boolean\([\s\S]*commitment && commitment\.recurrence !== "none"/,
  );
  assert.match(calendarForm, /title=\{formTitle\}/);
  assert.match(calendarForm, /subtitle=\{formSubtitle\}/);
});
