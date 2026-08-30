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
  assert.match(
    proxySource,
    /if \(!hasVerifiedClaims && requiresUserSession\(pathname\)\)/,
  );
  assert.match(proxySource, /url\.pathname = "\/auth\/login"/);
  assert.match(proxySource, /const redirectResponse = NextResponse\.redirect\(url\)/);
  assert.match(proxySource, /redirectResponse\.cookies\.set\(cookie\)/);
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
    /bypassesUserSessionProxy\(pathname\) \|\|\s+isPublicApplicationRoute\(pathname\)[\s\S]*return supabaseResponse;/,
  );
});

test("existing public-route behaviour is unchanged", () => {
  assert.equal(isPublicApplicationRoute("/"), true);
  assert.equal(isPublicApplicationRoute("/auth/login"), true);
  assert.equal(isPublicApplicationRoute("/offline"), true);
  assert.equal(requiresUserSession("/auth/login"), false);
  assert.match(
    proxySource,
    /bypassesUserSessionProxy\(pathname\) \|\|\s+isPublicApplicationRoute\(pathname\)/,
  );
});

test("a stale refresh token becomes an unauthenticated redirect instead of an application error", () => {
  assert.match(proxySource, /try \{\s+const \{ data, error \} = await supabase\.auth\.getClaims\(\)/);
  assert.match(proxySource, /catch \{[\s\S]*hasVerifiedClaims = false/);
  assert.match(proxySource, /private, no-cache, no-store, must-revalidate/);
});

test("refreshed cookies and their no-cache headers are returned together", () => {
  assert.match(proxySource, /setAll\(cookiesToSet, responseHeaders\)/);
  assert.match(
    proxySource,
    /Object\.entries\(responseHeaders\)[\s\S]*supabaseResponse\.headers\.set/,
  );
});
