import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../../app/api/notifications/dispatch/route.ts", import.meta.url),
  "utf8",
);
const httpBoundary = readFileSync(
  new URL("./notification-dispatch-http.ts", import.meta.url),
  "utf8",
);

test("dispatcher route is Node-only, secret-protected and non-cacheable", () => {
  assert.match(route, /Node\.js runtime by default/);
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(httpBoundary, /request\.headers\.get\("authorization"\)/);
  assert.match(httpBoundary, /status: 401/);
  assert.match(httpBoundary, /Cache-Control.*no-store/s);
});

test("dispatcher response surface does not mention subscription credentials", () => {
  assert.doesNotMatch(route, /p256dh|auth_key|private_key|endpoint/i);
  assert.match(route, /dispatchDueNotifications/);
  assert.doesNotMatch(route, /export async function GET/);
});
