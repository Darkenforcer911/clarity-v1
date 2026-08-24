import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agendaSource = readFileSync(
  new URL("../../components/clarity/calendar-agenda.tsx", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../../components/clarity/calendar-commitment-form.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

test("heading and selected chip use the same canonical local date", () => {
  assert.match(agendaSource, /formatFullLocalDate\(selectedDate\)/);
  assert.match(agendaSource, /const selected = date === selectedDate/);
  assert.match(agendaSource, /aria-current=\{selected \? "date" : undefined\}/);
});

test("touch devices do not retain a misleading hover highlight", () => {
  assert.doesNotMatch(
    agendaSource,
    /border-transparent text-muted-foreground hover:bg-secondary/,
  );
  assert.match(agendaSource, /calendar-date-chip/);
  assert.match(stylesSource, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(
    stylesSource,
    /\.calendar-date-chip:not\(\[aria-current="date"\]\):hover/,
  );
});

test("Add commitment initializes from the exact selected date", () => {
  assert.match(formSource, /commitment\?\.local_date \?\? selectedDate/);
  assert.match(formSource, /name="localDate"/);
  assert.match(formSource, /value=\{localDate\}/);
});
