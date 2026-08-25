import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000002_return_boundary_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const dailyLoopQueries = readFileSync(
  new URL("./daily-loop-queries.ts", import.meta.url),
  "utf8",
);
const transitionActionSource = readFileSync(
  new URL(
    "../../app/(app)/today/day-transition-actions.ts",
    import.meta.url,
  ),
  "utf8",
);
const transientNoticeSource = readFileSync(
  new URL(
    "../../components/clarity/transient-notice.tsx",
    import.meta.url,
  ),
  "utf8",
);
const eventConstraintMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260825000003_allow_return_boundary_product_event.sql",
    import.meta.url,
  ),
  "utf8",
);
const boundaryRpc = migration.match(
  /create function public\.record_return_boundary_v1\([\s\S]*?\n\$\$;/,
)?.[0];

test("return boundaries are canonical neutral records", () => {
  assert.match(
    migration,
    /add column boundary_kind text not null default 'gap'/,
  );
  assert.match(
    migration,
    /boundary_kind in \('gap', 'catch_up', 'get_current'\)/,
  );
  assert.match(
    migration,
    /boundary_kind in \('catch_up', 'get_current'\)[\s\S]*not nothing_important/,
  );
});

test("recording a boundary never rewrites historical plans, actions, or outcomes", () => {
  assert.ok(boundaryRpc);
  assert.doesNotMatch(boundaryRpc, /update public\.daily_plans/);
  assert.doesNotMatch(boundaryRpc, /update public\.daily_actions/);
  assert.doesNotMatch(boundaryRpc, /update public\.day_records/);
  assert.doesNotMatch(boundaryRpc, /insert into public\.day_records/);
  assert.match(
    boundaryRpc,
    /context_summary,[\s\S]*nothing_important,[\s\S]*boundary_kind[\s\S]*null,[\s\S]*false,[\s\S]*p_boundary_kind/,
  );
});

test("boundary submission is authenticated, locked, idempotent, and stale-safe", () => {
  assert.ok(boundaryRpc);
  assert.match(boundaryRpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(boundaryRpc, /where profile\.id = v_user_id[\s\S]*for update/);
  assert.match(boundaryRpc, /for update of action/);
  assert.match(
    boundaryRpc,
    /if v_record_id is not null then[\s\S]*return v_record_id/,
  );
  assert.match(boundaryRpc, /The return state has changed/);
  assert.match(boundaryRpc, /The return date range has changed/);
  assert.match(
    boundaryRpc,
    /on conflict \(user_id, gap_start_date, gap_end_date\) do nothing/,
  );
});

test("a newer boundary supersedes only dates through its end", () => {
  assert.match(
    migration,
    /if v_latest_boundary_end >= v_yesterday then[\s\S]*'state', 'ready_for_today'/,
  );
  assert.match(
    migration,
    /v_resolved_anchor := greatest\([\s\S]*v_latest_boundary_end,[\s\S]*v_latest_closed_date/,
  );
  assert.match(
    migration,
    /plan\.local_date between v_range_start and v_yesterday[\s\S]*plan\.approved_at is not null[\s\S]*plan\.status in \('proposed', 'active', 'closing'\)/,
  );
});

test("unapproved active states remain integrity errors", () => {
  assert.match(
    migration,
    /plan\.approved_at is null[\s\S]*plan\.status in \('active', 'closing'\)[\s\S]*Previous daily plan has an invalid approval state/,
  );
  assert.match(
    migration,
    /plan\.approved_at is null[\s\S]*action\.approved_at is not null[\s\S]*Previous daily plan has approved actions without approval/,
  );
});

test("Today consumes the authoritative RPC instead of reclassifying dates", () => {
  assert.match(
    dailyLoopQueries,
    /callUntypedRpc\(supabase, "get_return_backlog_state", \{\}\)/,
  );
  assert.doesNotMatch(dailyLoopQueries, /resolvePreviousDayRouting/);
});

test("the product event constraint accepts the return-boundary audit event", () => {
  assert.match(
    eventConstraintMigration,
    /add constraint product_events_known_name check/,
  );
  assert.match(eventConstraintMigration, /'return_boundary_recorded'/);
  assert.match(boundaryRpc, /'return_boundary_recorded'/);
});

test("the forward constraint preserves every previously allowed product event", () => {
  for (const eventName of [
    "app_opened",
    "day_shaping_started",
    "plan_generated",
    "plan_approved",
    "action_completed",
    "day_closing_started",
    "day_closed",
    "day_close_undone",
    "action_removed_from_today",
    "action_replaced",
    "action_restored_to_today",
  ]) {
    assert.match(eventConstraintMigration, new RegExp(`'${eventName}'`));
  }
});

test("a six-day neutral boundary reaches Ready for Today without historical mutation", () => {
  assert.match(
    boundaryRpc,
    /insert into public\.return_gap_records[\s\S]*p_range_start_date,[\s\S]*p_range_end_date/,
  );
  assert.match(
    migration,
    /if v_latest_boundary_end >= v_yesterday then[\s\S]*'state', 'ready_for_today'/,
  );
  assert.doesNotMatch(boundaryRpc, /update public\.daily_(plans|actions)/);
  assert.match(
    boundaryRpc,
    /if v_record_id is not null then[\s\S]*return v_record_id/,
  );
});

test("successful Catch Up returns directly to Today with a one-shot acknowledgement", () => {
  const persistAt = transitionActionSource.indexOf(
    "await dailyLoopService.recordReturnBoundary(data)",
  );
  const redirectAt = transitionActionSource.indexOf(
    'redirect("/today?notice=caught-up")',
  );

  assert.ok(persistAt >= 0);
  assert.ok(redirectAt > persistAt);
  assert.match(transientNoticeSource, /"caught-up": "Caught up"/);
  assert.match(transientNoticeSource, /pointer-events-none fixed/);
  assert.match(transientNoticeSource, /window\.setTimeout/);
  assert.match(
    transientNoticeSource,
    /router\.replace\(pathname, \{ scroll: false \}\)/,
  );
});

test("the transient handoff cannot create a second boundary", () => {
  assert.equal(
    transitionActionSource.match(/recordReturnBoundary\(data\)/g)?.length,
    1,
  );
  assert.doesNotMatch(transitionActionSource, /RETURN_BOUNDARY_COMPLETION/);
  assert.doesNotMatch(transitionActionSource, /continueAfterCatchUpAction/);
});
