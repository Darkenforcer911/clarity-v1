import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260817000001_notification_cron_scheduler.sql",
    import.meta.url,
  ),
  "utf8",
);

test("notification Cron targets the stable dispatcher with POST every minute", () => {
  assert.match(
    migration,
    /https:\/\/clarity-v1-six\.vercel\.app\/api\/notifications\/dispatch/,
  );
  assert.match(migration, /net\.http_post\(/);
  assert.match(migration, /'clarity-notification-dispatch'/);
  assert.match(migration, /'\* \* \* \* \*'/);
});

test("the Authorization header is assembled only from the named Vault secret", () => {
  assert.match(migration, /from vault\.decrypted_secrets/);
  assert.match(
    migration,
    /'Authorization', 'Bearer ' \|\| secret\.decrypted_secret/,
  );
  assert.match(
    migration,
    /where name = 'clarity_notification_dispatch_cron_bearer'/,
  );
  assert.doesNotMatch(migration, /Bearer [A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(migration, /<CRON_SECRET>|YOUR_CRON_SECRET/);
});

test("the scheduler enables required extensions and replaces duplicate jobs", () => {
  assert.match(migration, /create extension if not exists pg_cron/i);
  assert.match(migration, /create extension if not exists pg_net/i);
  assert.match(migration, /create extension if not exists supabase_vault/i);
  assert.match(
    migration,
    /where jobname = 'clarity-notification-dispatch'/,
  );
  assert.match(migration, /cron\.unschedule\(v_job_id\)/);
  assert.match(migration, /cron\.schedule\(/);
});

test("the repository does not configure Vercel Cron", () => {
  assert.equal(
    existsSync(new URL("../../vercel.json", import.meta.url)),
    false,
  );
});
