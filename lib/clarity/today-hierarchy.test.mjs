import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activeToday = readFileSync(
  new URL("../../components/clarity/active-today.tsx", import.meta.url),
  "utf8",
);
const architecture = readFileSync(
  new URL("../../docs/clarity-intelligence-v1.md", import.meta.url),
  "utf8",
);

test("Active Today renders only approaching commitments before Next Action", () => {
  const comingUpAt = activeToday.indexOf('heading="Coming up"');
  const nextActionAt = activeToday.indexOf("{nextAction ? (");
  const laterAt = activeToday.indexOf(
    "heading={getLaterCommitmentsHeading",
  );

  assert.ok(comingUpAt >= 0);
  assert.ok(nextActionAt > comingUpAt);
  assert.ok(laterAt > nextActionAt);
  assert.match(
    activeToday,
    /nextActionDurationMinutes: nextAction\?\.estimated_minutes \?\? null/,
  );
});

test("future Clarity focus proposals cannot silently rewrite an accepted day", () => {
  for (const input of [
    "Current Direction",
    "immediate bottleneck",
    "Calendar constraints",
    "available capacity",
    "Action duration",
    "recent evidence",
    "current profile-local time",
    "accepted Shape Today plan",
  ]) {
    assert.match(architecture, new RegExp(input));
  }
  assert.match(architecture, /does not silently rewrite/);
  assert.match(architecture, /confirmed before[\s\S]*application logic applies it/);
});
