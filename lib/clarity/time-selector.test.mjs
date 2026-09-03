import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selectorSource = readFileSync(
  new URL("../../components/clarity/time-selector.tsx", import.meta.url),
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
const calendarParserSource = readFileSync(
  new URL("./calendar-form.ts", import.meta.url),
  "utf8",
);
const calendarRulesSource = readFileSync(
  new URL("./calendar-rules.ts", import.meta.url),
  "utf8",
);
const globalStylesSource = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("Action and Calendar use the same native TimeSelector field", () => {
  assert.match(actionFieldsSource, /<OptionalTimeSelector/);
  assert.match(selectorSource, /<TimeSelector/);
  assert.match(
    actionFieldsSource,
    /name=\{mode === "completed" \? "completedTime" : "scheduledTime"\}/,
  );
  assert.match(calendarFormSource, /<TimeSelector/);
  assert.match(calendarFormSource, /name="eventStartTime"/);
  assert.match(calendarFormSource, /name="deadlineDueTime"/);
  assert.doesNotMatch(
    selectorSource.slice(
      selectorSource.indexOf('data-slot="clarity-time-selector"'),
    ),
    /Clock3|<Clock/,
  );
});

test("existing Action and Calendar times prefill the same controlled native value", () => {
  assert.match(
    actionFieldsSource,
    /mode === "completed"[\s\S]*initialValues\.completedTime[\s\S]*initialValues\.scheduledTime/,
  );
  assert.match(
    calendarFormSource,
    /commitment\?\.event_start_time\?\.slice\(0, 5\) \?\? ""/,
  );
  assert.match(
    calendarFormSource,
    /commitment\?\.deadline_due_time\?\.slice\(0, 5\) \?\? ""/,
  );
  assert.match(selectorSource, /value=\{value\}/);
});

test("Calendar Start time uses the compact shared presentation", () => {
  assert.match(
    calendarFormSource,
    /name="eventStartTime"[\s\S]*label="Start time"[\s\S]*summary=\{formatCommitmentTime\(eventStartTime\) \?\? "Choose time"\}[\s\S]*value=\{eventStartTime\}[\s\S]*onChange=\{setEventStartTime\}/,
  );
  assert.match(selectorSource, /data-slot="when-time-selector"/);
  assert.match(selectorSource, /className="sr-only"/);
});

test("Calendar Start time preserves and formats its existing scheduled value", () => {
  assert.match(
    calendarFormSource,
    /commitment\?\.event_start_time\?\.slice\(0, 5\) \?\? ""/,
  );
  assert.match(calendarRulesSource, /export function formatCommitmentTime/);
  assert.match(calendarRulesSource, /`\$\{displayHour\}:\$\{String\(minute\)\.padStart\(2, "0"\)\} \$\{period\}`/);
});

test("Calendar Start time changes only from the native input value", () => {
  const eventTimeControl = calendarFormSource.slice(
    calendarFormSource.indexOf('key="event-time"'),
    calendarFormSource.indexOf("</>", calendarFormSource.indexOf('key="event-time"')),
  );
  assert.match(eventTimeControl, /value=\{eventStartTime\}/);
  assert.match(eventTimeControl, /onChange=\{setEventStartTime\}/);
  assert.doesNotMatch(eventTimeControl, /setDeadlineDueTime|setReminderOffsets/);
});

test("opening or dismissing compact Start time does not mutate it", () => {
  const compactSelector = selectorSource.slice(
    selectorSource.indexOf('if (summary !== undefined)'),
    selectorSource.indexOf("return (", selectorSource.indexOf('if (summary !== undefined)') + 30),
  );
  assert.doesNotMatch(compactSelector, /onClick|onPointerDown|onFocus/);
  assert.match(selectorSource, /onChange=\{\(event\) => onChange\(event\.currentTarget\.value\)\}/);
});

test("the real native time input is visible in normal layout", () => {
  assert.doesNotMatch(selectorSource, /components\/ui\/input/);
  assert.match(selectorSource, /<input/);
  assert.match(selectorSource, /type="time"/);
  assert.match(selectorSource, /name=\{name\}/);
  assert.match(selectorSource, /value=\{value\}/);
  assert.match(
    selectorSource,
    /block min-h-12 w-full min-w-0 max-w-full rounded-xl border border-input bg-card px-3 py-2 font-sans text-base leading-normal text-foreground shadow-sm/,
  );
  assert.doesNotMatch(selectorSource, /color-scheme/);
  assert.match(
    selectorSource,
    /onChange=\{\(event\) => \{[\s\S]*onChange\(event\.currentTarget\.value\)/,
  );
  assert.doesNotMatch(selectorSource, /opacity-0/);
  assert.doesNotMatch(selectorSource, /absolute inset-0/);
  assert.doesNotMatch(selectorSource, /pointer-events-none/);
  assert.doesNotMatch(selectorSource, /<select/);
  assert.doesNotMatch(selectorSource, /TIME_OPTIONS/);
  assert.doesNotMatch(selectorSource, /What time\?/);
  assert.doesNotMatch(selectorSource, /showPicker|\.click\(\)/);
  assert.doesNotMatch(globalStylesSource, /action-time-native/);
  assert.doesNotMatch(selectorSource, /<fieldset/);
  assert.match(
    selectorSource,
    /data-slot="clarity-time-selector"[\s\S]*className="block min-w-0"/,
  );
  assert.doesNotMatch(
    selectorSource,
    /data-slot="clarity-time-selector"[\s\S]{0,140}(?:border|bg-|height|h-screen)/,
  );
});

test("Calendar adds no wrapper or positioning around the shared native field", () => {
  assert.match(calendarFormSource, /<TimeSelector/);
  assert.doesNotMatch(calendarFormSource, /native-time|time-input-wrapper/);
  assert.doesNotMatch(selectorSource, /absolute|fixed|overflow-hidden/);
});

test("global styling keeps native time appearance and chrome intact", () => {
  assert.doesNotMatch(
    globalStylesSource,
    /input\[type="time"\]::\-webkit-/,
  );
  const appearanceRules = globalStylesSource.slice(
    globalStylesSource.indexOf('input[type="date"],\n  input[type="datetime-local"]'),
    globalStylesSource.indexOf('input[type="date"]::-webkit-date-and-time-value'),
  );
  assert.doesNotMatch(appearanceRules, /input\[type="time"\]/);
  assert.doesNotMatch(
    globalStylesSource,
    /input\[type="date"\],\s*input\[type="time"\]/,
  );
});

test("the shared field participates in the existing accordion without custom picker UI", () => {
  assert.match(selectorSource, /onPointerDown=\{\(\) => onExpandedChange\?\.\(true\)\}/);
  assert.match(selectorSource, /onFocus=\{\(\) => onExpandedChange\?\.\(true\)\}/);
  assert.match(
    selectorSource,
    /onChange\(event\.currentTarget\.value\)/,
  );
  assert.doesNotMatch(selectorSource, /onBlur=\{/);
});

test("retrospective When is one visible row backed by its native input", () => {
  assert.match(selectorSource, /data-slot="when-time-selector"/);
  assert.match(
    selectorSource,
    /<label className="flex min-h-14[\s\S]*<input[\s\S]*type="time"[\s\S]*className="sr-only"[\s\S]*\{summary\}/,
  );
  assert.match(selectorSource, /\{value && onRemove && \(/);
  assert.match(selectorSource, /Remove time/);
  assert.doesNotMatch(selectorSource, /showPicker|\.click\(\)/);
  assert.doesNotMatch(selectorSource, /absolute inset-0|opacity-0/);
});

test("mobile native time geometry is compact without hiding the input", () => {
  assert.doesNotMatch(globalStylesSource, /\.clarity-time-input/);
  assert.match(selectorSource, /min-h-12/);
  assert.doesNotMatch(selectorSource, /!h-|max-h-|py-0/);
  assert.doesNotMatch(selectorSource, /opacity-0|visibility-hidden|pointer-events-none/);
});

test("Calendar keeps authoritative required-time validation", () => {
  assert.match(
    calendarParserSource,
    /value\.commitmentType === "event" && !validTime\(value\.eventStartTime\)/,
  );
  assert.match(calendarParserSource, /Choose a start time\./);
  assert.match(calendarParserSource, /Choose a due time or select No exact time\./);
});

test("custom time-selector experiment code is gone", () => {
  assert.doesNotMatch(selectorSource, />Hour<|>Minute<|AM\/PM/);
  assert.doesNotMatch(selectorSource, /formatTimeSelectorSummary|resolveCanonicalTime|getTimeSelectorDraft/);
  assert.doesNotMatch(selectorSource, /Done/);
});
