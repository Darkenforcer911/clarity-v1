import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatAddedActionNotice } from "./add-action-destination.ts";

const noticeSource = readFileSync(
  new URL("../../components/clarity/transient-notice.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../components/clarity/app-shell.tsx", import.meta.url),
  "utf8",
);

test("Action acknowledgement retains timed and flexible copy", () => {
  assert.equal(formatAddedActionNotice("16:50"), "Added for 4:50 pm");
  assert.equal(formatAddedActionNotice(null), "Added as flexible");
});

test("Action acknowledgement uses one mobile-safe fixed overlay", () => {
  assert.match(
    noticeSource,
    /pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center/,
  );
  assert.match(
    noticeSource,
    /pt-\[calc\(env\(safe-area-inset-top\)\+4\.25rem\)\]/,
  );
  assert.match(noticeSource, /role="status"/);
  assert.match(noticeSource, /aria-live="polite"/);
  assert.match(noticeSource, /w-fit max-w-full/);
  assert.match(appShellSource, /<TransientNotice \/>/);
});

test("the acknowledgement clears automatically without stacking notices", () => {
  assert.match(noticeSource, /window\.setTimeout/);
  assert.match(noticeSource, /3000/);
  assert.match(noticeSource, /router\.replace\(pathname, \{ scroll: false \}\)/);
  assert.doesNotMatch(noticeSource, /messages\.map|notices\.map/);
});
