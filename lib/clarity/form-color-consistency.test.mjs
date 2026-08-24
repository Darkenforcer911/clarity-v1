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
const reminderField = source(
  "../../components/clarity/calendar-reminder-field.tsx",
);
const recurrenceControl = source(
  "../../components/clarity/recurrence-control.tsx",
);
const disclosure = source(
  "../../components/clarity/secondary-setting-disclosure.tsx",
);
const detailsControl = source(
  "../../components/clarity/details-control.tsx",
);
const button = source("../../components/ui/button.tsx");

test("Action and Calendar forms use the same card surface colour roles", () => {
  assert.match(actionForm, /border border-border bg-card[^"\n]*text-foreground/);
  assert.match(calendarForm, /border border-border bg-card[^"\n]*text-foreground/);
  assert.doesNotMatch(
    actionForm,
    /border-\[var\(--clarity-completed\)\][^"\n]*bg-secondary/,
  );
});

test("shared secondary rows own one surface, border, and cyan active state", () => {
  assert.match(disclosure, /border bg-secondary/);
  assert.match(disclosure, /expanded \? "border-ring" : "border-border"/);
  assert.match(disclosure, /text-ring/);
  assert.match(disclosure, /text-foreground/);
  assert.match(disclosure, /text-muted-foreground/);
  assert.match(disclosure, /focus-visible:ring-ring/);
});

test("Calendar and Action option controls share cyan active styling", () => {
  assert.match(recurrenceControl, /border-ring bg-secondary text-foreground/);
  assert.match(reminderField, /border-ring bg-secondary text-foreground/);
  assert.match(calendarForm, /border-ring bg-secondary text-foreground/);
  assert.match(actionFields, /border-ring bg-secondary text-foreground/);
  assert.doesNotMatch(reminderField, /border-primary bg-primary\/15/);
});

test("validation and primary action colours use semantic shared tokens", () => {
  assert.match(actionFields, /text-destructive/);
  assert.match(detailsControl, /text-destructive/);
  assert.match(calendarForm, /text-destructive/);
  assert.match(button, /bg-primary text-primary-foreground/);
  for (const formSource of [actionForm, actionFields, calendarForm]) {
    assert.doesNotMatch(formSource, /var\(--clarity-completed\)/);
  }
});
