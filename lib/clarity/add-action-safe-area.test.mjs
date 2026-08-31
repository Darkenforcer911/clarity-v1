import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formSource = readFileSync(
  new URL("../../components/clarity/add-action-form.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../components/clarity/app-shell.tsx", import.meta.url),
  "utf8",
);

test("Add Action auto-scroll keeps its header below the iOS safe area", () => {
  assert.match(appShellSource, /data-app-shell-header/);
  assert.match(appShellSource, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(formSource, /querySelector<HTMLElement>\([\s\S]*"\[data-app-shell-header\]"/);
  assert.match(formSource, /window\.getComputedStyle\(appHeader\)\.paddingTop/);
  assert.match(formSource, /const visibleTop = safeAreaTop \+ 12/);
  assert.match(formSource, /bounds\.top < visibleTop/);
  assert.match(formSource, /adjustment = bounds\.top - visibleTop/);
  assert.doesNotMatch(formSource, /bounds\.top < 12/);
});
