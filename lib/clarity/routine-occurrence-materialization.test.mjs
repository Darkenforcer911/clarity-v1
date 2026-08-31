import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260901000001_routine_daily_action_occurrences.sql",
    import.meta.url,
  ),
  "utf8",
);
const dailyLoopService = readFileSync(
  new URL("./daily-loop-service.ts", import.meta.url),
  "utf8",
);
const calendarDailyActions = readFileSync(
  new URL("./calendar-daily-actions.ts", import.meta.url),
  "utf8",
);
const removeActionMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260727000003_remove_action_from_today.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacyRecurrence = readFileSync(
  new URL("./action-recurrence.ts", import.meta.url),
  "utf8",
);

test("one Routine occurrence is allowed per owned daily plan, including removed rows", () => {
  assert.match(
    migration,
    /create unique index daily_actions_plan_source_routine_key[\s\S]*\(daily_plan_id, source_routine_id\)[\s\S]*where source_routine_id is not null/i,
  );
  assert.doesNotMatch(
    migration,
    /daily_actions_plan_source_routine_key[\s\S]{0,180}status\s*(?:=|<>)/i,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*existing\.daily_plan_id = v_plan\.id[\s\S]*existing\.user_id = v_user_id[\s\S]*existing\.source_routine_id = routine\.id/i,
  );
});

test("materialization is authenticated, profile-local, locked, and proposal-only", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /if v_user_id is null[\s\S]*Authentication required/i);
  assert.match(
    migration,
    /select profile\.timezone[\s\S]*where profile\.id = v_user_id/i,
  );
  assert.match(
    migration,
    /p_local_date is distinct from \(clock_timestamp\(\) at time zone v_timezone\)::date/i,
  );
  assert.match(
    migration,
    /from public\.daily_plans as plan[\s\S]*plan\.user_id = v_user_id[\s\S]*for update/i,
  );
  assert.match(
    migration,
    /v_plan\.status <> 'proposed' or v_plan\.local_date <> p_local_date/i,
  );
  assert.match(
    migration,
    /from public\.routines as routine[\s\S]*routine\.user_id = v_user_id[\s\S]*for update/i,
  );
});

test("daily and matching certain-day Routines materialize, but weekly quotas do not", () => {
  assert.match(migration, /routine\.cadence = 'daily'/i);
  assert.match(
    migration,
    /routine\.cadence = 'certain_days'[\s\S]*extract\(dow from p_local_date\)::smallint = any\(routine\.weekdays\)/i,
  );
  const insert = migration.slice(
    migration.indexOf("insert into public.daily_actions"),
    migration.indexOf("update public.daily_plans"),
  );
  assert.doesNotMatch(insert, /routine\.cadence = 'weekly'/i);
  assert.doesNotMatch(insert, /routine\.cadence = 'times_per_week'/i);
});

test("Routine occurrences are dated proposal rows with atomic canonical relationships", () => {
  assert.match(
    migration,
    /insert into public\.daily_actions \([\s\S]*source_routine_id[\s\S]*relationship_source/i,
  );
  assert.match(migration, /'proposed'::public\.daily_action_status/i);
  assert.match(migration, /routine\.id,[\s\S]*routine\.created_via/i);
  assert.match(migration, /'none',[\s\S]*'\{\}'::smallint\[\]/i);
  assert.doesNotMatch(migration, /insert into public\.life_evidence/i);
  assert.doesNotMatch(migration, /update public\.routines/i);
  assert.doesNotMatch(migration, /generate_series/i);
});

test("the existing Shape Today call is the single atomic integration point", () => {
  assert.match(
    dailyLoopService,
    /callUntypedRpc\([\s\S]*"save_context_only_proposed_plan"[\s\S]*p_local_date: localDate/i,
  );
  assert.match(
    migration,
    /v_plan_id := public\.save_proposed_plan\([\s\S]*insert into public\.daily_actions/i,
  );
  assert.match(
    migration,
    /on conflict \(daily_plan_id, source_routine_id\)[\s\S]*do nothing/i,
  );
});

test("accepted Routine occurrences use normal Today and Calendar truth", () => {
  assert.match(
    calendarDailyActions,
    /acceptedPlanStatuses = new Set\(\["active", "closing", "closed"\]\)/,
  );
  assert.match(
    calendarDailyActions,
    /filter\(\(action\) => action\.approved_at !== null\)/,
  );
  assert.match(calendarDailyActions, /source_routine_id: string \| null/);
});

test("Remove from today changes only the dated occurrence and cannot regenerate it", () => {
  const removeFunction = removeActionMigration.slice(
    removeActionMigration.indexOf("create function public.remove_action_from_today"),
    removeActionMigration.indexOf("revoke all on function public.remove_action_from_today"),
  );
  assert.match(removeFunction, /status = 'dropped'/i);
  assert.doesNotMatch(removeFunction, /update public\.routines|delete from public\.routines/i);
  assert.match(migration, /daily_actions_plan_source_routine_key/);
});

test("legacy Action recurrence is not an immortal occurrence engine", () => {
  assert.match(legacyRecurrence, /presentation metadata only/i);
  assert.match(legacyRecurrence, /Canonical[\s\S]*belongs to a Routine/i);
  assert.doesNotMatch(
    legacyRecurrence,
    /(?:supabase|rpc|daily_actions|save_context_only_proposed_plan)/i,
  );
});

test("only authenticated callers can execute the atomic proposal RPC", () => {
  assert.match(
    migration,
    /revoke all on function public\.save_context_only_proposed_plan\([\s\S]*\) from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.save_context_only_proposed_plan\([\s\S]*\) to authenticated/i,
  );
});
