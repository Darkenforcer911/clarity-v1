import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSupabaseServerFetch } from "./server-transport.ts";

const serverSource = readFileSync(
  new URL("./server.ts", import.meta.url),
  "utf8",
);
const browserSource = readFileSync(
  new URL("./client.ts", import.meta.url),
  "utf8",
);
const proxySource = readFileSync(
  new URL("./proxy.ts", import.meta.url),
  "utf8",
);

test("server requests may use a private Supabase transport without changing the public client identity", () => {
  assert.match(serverSource, /process\.env\.SUPABASE_SERVER_URL/);
  assert.match(serverSource, /const publicUrl = process\.env\.NEXT_PUBLIC_SUPABASE_URL!/);
  assert.match(serverSource, /createServerClient<Database>\(\s*publicUrl/);
  assert.match(serverSource, /global: \{ fetch: serverFetch \}/);
});

test("server transport rewrites only the configured public Supabase origin", async () => {
  const requests = [];
  const serverFetch = createSupabaseServerFetch(
    "https://restricted.example.test",
    "http://127.0.0.1:54321/",
    async (input, init) => {
      requests.push({
        url: input instanceof Request ? input.url : input.toString(),
        method: input instanceof Request ? input.method : init?.method,
        authorization:
          input instanceof Request
            ? input.headers.get("authorization")
            : undefined,
        body: input instanceof Request ? await input.text() : undefined,
      });
      return new Response(null, { status: 204 });
    },
  );

  assert.ok(serverFetch);
  await serverFetch(
    new Request(
      "https://restricted.example.test/rest/v1/profiles?id=eq.user-id",
      {
        method: "POST",
        headers: { authorization: "Bearer local-user-token" },
        body: '{"timezone":"UTC"}',
      },
    ),
  );
  await serverFetch("https://provider.example.test/v1/models");

  assert.deepEqual(requests, [
    {
      url: "http://127.0.0.1:54321/rest/v1/profiles?id=eq.user-id",
      method: "POST",
      authorization: "Bearer local-user-token",
      body: '{"timezone":"UTC"}',
    },
    {
      url: "https://provider.example.test/v1/models",
      method: undefined,
      authorization: undefined,
      body: undefined,
    },
  ]);
});

test("server transport override is inert when absent or already the public origin", () => {
  assert.equal(
    createSupabaseServerFetch("https://project.example.test", undefined),
    undefined,
  );
  assert.equal(
    createSupabaseServerFetch(
      "https://project.example.test/path",
      "https://project.example.test/other-path",
    ),
    undefined,
  );
});

test("browser and request-session clients continue to use the restricted public Supabase URL", () => {
  assert.match(browserSource, /process\.env\.NEXT_PUBLIC_SUPABASE_URL!/);
  assert.doesNotMatch(browserSource, /SUPABASE_SERVER_URL/);
  assert.match(proxySource, /process\.env\.NEXT_PUBLIC_SUPABASE_URL!/);
  assert.doesNotMatch(proxySource, /SUPABASE_SERVER_URL/);
});

test("server transport override does not change auth cookie naming or public signed URL generation", () => {
  assert.doesNotMatch(serverSource, /cookieOptions|storageKey/);
  assert.match(serverSource, /createServerClient<Database>\(\s*publicUrl/);
});
