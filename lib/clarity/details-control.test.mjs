import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatDetailsSummary } from "./details-ui.ts";

const detailsControlSource = readFileSync(
  new URL("../../components/clarity/details-control.tsx", import.meta.url),
  "utf8",
);
const secondarySettingSource = readFileSync(
  new URL(
    "../../components/clarity/secondary-setting-disclosure.tsx",
    import.meta.url,
  ),
  "utf8",
);
const actionFieldsSource = readFileSync(
  new URL("../../components/clarity/action-fields.tsx", import.meta.url),
  "utf8",
);
const calendarFormSource = readFileSync(
  new URL(
    "../../components/clarity/calendar-commitment-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("empty Details are collapsed by default and summarize as Not added", () => {
  assert.equal(formatDetailsSummary(""), "Not added");
  assert.equal(formatDetailsSummary("   \n  "), "Not added");
  assert.match(detailsControlSource, /expanded: boolean/);
  assert.match(detailsControlSource, /onExpandedChange: \(expanded: boolean\)/);
  assert.match(actionFieldsSource, /"details" \| "repeats" \| null/);
  assert.match(calendarFormSource, /CalendarSecondarySection \| null/);
  assert.match(detailsControlSource, /label="Details"/);
  assert.match(detailsControlSource, /icon=\{NotebookPen\}/);
});

test("existing Details use a concise one-line collapsed preview", () => {
  assert.equal(
    formatDetailsSummary("Bring the referral.\nArrive ten minutes early."),
    "Bring the referral. Arrive ten minutes early.",
  );
  assert.match(detailsControlSource, /summary=\{formatDetailsSummary\(value\)\}/);
  assert.match(secondarySettingSource, /block truncate text-sm/);
});

test("Calendar and Action use the same secondary-setting presentation", () => {
  assert.match(actionFieldsSource, /<DetailsControl/);
  assert.match(actionFieldsSource, /name="context"/);
  assert.match(calendarFormSource, /<DetailsControl/);
  assert.match(calendarFormSource, /name="details"/);
  assert.doesNotMatch(calendarFormSource, />\s*Add details\s*</);
  assert.doesNotMatch(actionFieldsSource, /label="Details — optional"/);
});

test("opening and editing retain the full controlled Details value", () => {
  assert.match(
    detailsControlSource,
    /Anything Clarity should know\? \(optional\)/,
  );
  assert.match(detailsControlSource, /type="hidden" name=\{name\} value=\{value\}/);
  assert.match(detailsControlSource, /value=\{value\}/);
  assert.match(
    detailsControlSource,
    /onChange=\{\(event\) => onChange\(event\.currentTarget\.value\)\}/,
  );
});

test("editing and clearing update the summary without changing field semantics", () => {
  assert.equal(formatDetailsSummary("Updated detail"), "Updated detail");
  assert.equal(formatDetailsSummary(""), "Not added");
  assert.match(actionFieldsSource, /const \[context, setContext\] = useState/);
  assert.match(calendarFormSource, /const \[details, setDetails\] = useState/);
});

test("Done only collapses the disclosure and does not submit the form", () => {
  assert.match(
    secondarySettingSource,
    /type="button"[\s\S]*onClick=\{onDone \?\? \(\(\) => onExpandedChange\(false\)\)\}[\s\S]*Done/,
  );
  assert.doesNotMatch(secondarySettingSource, /type="submit"/);
});
