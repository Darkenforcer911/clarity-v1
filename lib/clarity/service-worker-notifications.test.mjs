import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadUtils() {
  const source = readFileSync(
    new URL("../../public/notification-sw-utils.js", import.meta.url),
    "utf8",
  );
  const scope = { location: { origin: "https://clarity.example" } };
  vm.runInNewContext(source, { self: scope, URL, encodeURIComponent });
  return scope.ClarityNotificationUtils;
}

const targetPath =
  "/calendar?date=2026-08-17&commitment=10000000-0000-4000-8000-000000000001";
const absoluteTarget = `https://clarity.example${targetPath}`;

test("push payload accepts a controlled Calendar deep link", () => {
  const { parsePushPayload } = loadUtils();
  assert.deepEqual(
    structuredClone(
      parsePushPayload({
        title: "Doctor appointment",
        body: "Starts in 2 hours",
        tag: "calendar:appointment:120",
        targetUrl: targetPath,
      }),
    ),
    {
      title: "Doctor appointment",
      body: "Starts in 2 hours",
      tag: "calendar:appointment:120",
      targetUrl: targetPath,
    },
  );
});

test("notification click with no client opens the exact Calendar target", async () => {
  const { openNotificationTarget } = loadUtils();
  let openedUrl = null;
  const openedClient = { url: absoluteTarget };
  const result = await openNotificationTarget(
    {
      matchAll: async () => [],
      openWindow: async (url) => {
        openedUrl = url;
        return openedClient;
      },
    },
    targetPath,
  );

  assert.equal(openedUrl, absoluteTarget);
  assert.equal(result, openedClient);
});

test("a start-url launch is explicitly redirected to the Calendar target", async () => {
  const { openNotificationTarget } = loadUtils();
  const calls = [];
  const openedClient = {
    url: "https://clarity.example/today",
    async focus() {
      calls.push("focus");
      return this;
    },
    async navigate(url) {
      calls.push(["navigate", url]);
      this.url = url;
      return this;
    },
  };
  const result = await openNotificationTarget(
    {
      matchAll: async () => [],
      openWindow: async () => openedClient,
    },
    targetPath,
  );

  assert.equal(result, openedClient);
  assert.equal(openedClient.url, absoluteTarget);
  assert.deepEqual(calls, ["focus", ["navigate", absoluteTarget], "focus"]);
});

test("notification click focuses and navigates an existing Today client", async () => {
  const { openNotificationTarget } = loadUtils();
  const calls = [];
  const client = {
    url: "https://clarity.example/today",
    async focus() {
      calls.push("focus");
      return this;
    },
    async navigate(url) {
      calls.push(["navigate", url]);
      this.url = url;
      return this;
    },
  };
  const result = await openNotificationTarget(
    {
      matchAll: async () => [client],
      openWindow: async () => assert.fail("must not open another window"),
    },
    targetPath,
  );

  assert.equal(result, client);
  assert.equal(client.url, absoluteTarget);
  assert.deepEqual(calls, ["focus", ["navigate", absoluteTarget], "focus"]);
});

test("an existing client receives an exact navigation fallback when navigate fails", async () => {
  const { NAVIGATION_MESSAGE_TYPE, openNotificationTarget } = loadUtils();
  let message = null;
  const client = {
    url: "https://clarity.example/today",
    async focus() {
      return this;
    },
    async navigate() {
      throw new TypeError("navigate failed");
    },
    postMessage(value) {
      message = value;
    },
  };
  await openNotificationTarget(
    {
      matchAll: async () => [client],
      openWindow: async () => assert.fail("must not open another window"),
    },
    targetPath,
  );

  assert.deepEqual(structuredClone(message), {
    type: NAVIGATION_MESSAGE_TYPE,
    targetUrl: absoluteTarget,
  });
});

test("unsafe notification click targets never focus, navigate, or open", async () => {
  const { openNotificationTarget } = loadUtils();
  let touchedClients = false;
  const result = await openNotificationTarget(
    {
      matchAll: async () => {
        touchedClients = true;
        return [];
      },
      openWindow: async () => {
        touchedClients = true;
      },
    },
    "https://evil.example/calendar?date=2026-08-17&commitment=10000000-0000-4000-8000-000000000001",
  );

  assert.equal(result, null);
  assert.equal(touchedClients, false);
});

test("push payload rejects external and malformed targets", () => {
  const { parsePushPayload, normalizeTargetUrl } = loadUtils();
  assert.equal(normalizeTargetUrl("https://evil.example/calendar"), null);
  assert.equal(normalizeTargetUrl("/today"), null);
  assert.equal(
    parsePushPayload({
      title: "Reminder",
      body: "Body",
      tag: "tag",
      targetUrl: "/calendar?date=bad&commitment=bad",
    }),
    null,
  );
});

test("service worker contains push display and click navigation handlers", () => {
  const source = readFileSync(
    new URL("../../public/sw.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /addEventListener\("push"/);
  assert.match(source, /showNotification/);
  assert.match(source, /addEventListener\("notificationclick"/);
  assert.match(source, /openNotificationTarget/);
  assert.match(source, /event\.waitUntil/);
});

test("normal installed-PWA launch still starts at Today", () => {
  const manifestSource = readFileSync(
    new URL("../../app/manifest.ts", import.meta.url),
    "utf8",
  );
  assert.match(manifestSource, /start_url: "\/today"/);
});
