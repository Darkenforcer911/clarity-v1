import assert from "node:assert/strict";
import test from "node:test";

import { handleNotificationDispatchRequest } from "./notification-dispatch-http.ts";

const summary = {
  materialized: 1,
  claimed: 1,
  sent: 1,
  retried: 0,
  skipped: 0,
  failed: 0,
};

function request(authorization) {
  return new Request("https://clarity.example/api/notifications/dispatch", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

test("dispatcher without Authorization returns its own 401 response", async () => {
  let dispatched = false;
  const response = await handleNotificationDispatchRequest(request(), {
    secret: "correct-secret",
    dispatch: async () => { dispatched = true; return summary; },
  });
  assert.equal(response.status, 401);
  assert.equal(dispatched, false);
  assert.deepEqual(await response.json(), { error: "Unauthorized." });
});

test("dispatcher rejects an incorrect CRON_SECRET", async () => {
  const response = await handleNotificationDispatchRequest(
    request("Bearer wrong-secret"),
    { secret: "correct-secret", dispatch: async () => summary },
  );
  assert.equal(response.status, 401);
});

test("valid CRON_SECRET reaches the dispatcher and returns safe counts", async () => {
  let dispatched = false;
  const response = await handleNotificationDispatchRequest(
    request("Bearer correct-secret"),
    {
      secret: "correct-secret",
      dispatch: async () => { dispatched = true; return summary; },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(dispatched, true);
  assert.deepEqual(await response.json(), summary);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});
