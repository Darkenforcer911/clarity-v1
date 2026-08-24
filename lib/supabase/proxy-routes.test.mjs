import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bypassesUserSessionProxy,
  isPublicApplicationRoute,
  requiresUserSession,
} from "./proxy-routes.ts";

const proxySource = readFileSync(
  new URL("./proxy.ts", import.meta.url),
  "utf8",
);

test("normal private routes still require a user session", () => {
  assert.equal(requiresUserSession("/today"), true);
  assert.equal(requiresUserSession("/calendar"), true);
  assert.equal(requiresUserSession("/api/private-example"), true);
});

test("the proxy retains its unauthenticated login redirect", () => {
  assert.match(proxySource, /if \(!user && requiresUserSession\(pathname\)\)/);
  assert.match(proxySource, /url\.pathname = "\/auth\/login"/);
  assert.match(proxySource, /return NextResponse\.redirect\(url\)/);
});

test("only the exact notification dispatcher path bypasses the session proxy", () => {
  assert.equal(
    bypassesUserSessionProxy("/api/notifications/dispatch"),
    true,
  );
  assert.equal(
    requiresUserSession("/api/notifications/dispatch"),
    false,
  );
  assert.equal(
    bypassesUserSessionProxy("/api/notifications/dispatch/debug"),
    false,
  );
  assert.equal(
    bypassesUserSessionProxy("/api/notifications/other"),
    false,
  );
  assert.match(
    proxySource,
    /if \(bypassesUserSessionProxy\(pathname\)\) \{\s+return supabaseResponse;/,
  );
});

test("existing public-route behaviour is unchanged", () => {
  assert.equal(isPublicApplicationRoute("/"), true);
  assert.equal(isPublicApplicationRoute("/auth/login"), true);
  assert.equal(isPublicApplicationRoute("/offline"), true);
  assert.equal(requiresUserSession("/auth/login"), false);
});
