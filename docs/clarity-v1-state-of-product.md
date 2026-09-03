# State of Clarity V1

Audit date: 4 September 2026  
Repository baseline: `2f193e8 simplify universal action form`, plus the uncommitted duration-hint test change described in section 15.

## Status language

- **Implemented** — product code and an authoritative persistence/read path exist in this repository.
- **Partially implemented** — a usable path exists, but important behavior, operational configuration, or end-to-end proof is missing.
- **Foundation only** — types, schema, policy, or a placeholder surface exists without the intended user capability.
- **Not implemented** — no working product path exists.
- **Deferred** — deliberately excluded from this V1 build.
- **Known limitation** — shipped or testable behavior has a documented constraint.

# 1. Executive summary

Clarity is currently an authenticated, mobile-first personal planning application with four first-class surfaces: Today, Calendar, Clarity, and Life. A user can shape and approve a day, manage dated Actions and Calendar commitments, record outcomes and historical evidence, handle a return after time away, inspect a canonical Life Model, and prepare proposal-confirmed Life changes. The canonical navigation is defined in `components/clarity/bottom-navigation.tsx`; the application shell and PWA-safe layout are in `components/clarity/app-shell.tsx` and `app/layout.tsx`.

The deterministic product foundation is real. Daily plans, Actions, Calendar commitments and occurrences, Day Records, Return Boundaries, Life records, and notification deliveries have database designs and ownership-safe RPCs in `supabase/migrations/`. Today reads Calendar constraints, Calendar projects the same `daily_actions` rows, and a dated Action keeps one ID across both views (`lib/clarity/daily-loop-queries.ts`, `lib/clarity/calendar-service.ts`, `components/clarity/calendar-daily-actions.tsx`).

The intelligence is not real yet. `/clarity` is an honest placeholder that can attach an owner-scoped Action or date context but cannot accept or answer a message (`app/(app)/clarity/page.tsx`). Shape Today currently calls a deterministic, hard-coded `MockClarityAI` that proposes CV/job-search/sister/gym Actions rather than a model provider (`lib/clarity/daily-loop-service.ts`, `lib/clarity/ai/mock-clarity-ai.ts`). The context, memory, orchestration, opportunity, forecast, and authority types are contracts only (`lib/clarity/ai/`).

The product is therefore closer to a coherent deterministic planning beta than to an intelligent V1. The single biggest missing capability is a provider-neutral runtime that can take authenticated canonical context plus a user turn, return a validated structured next move, and route consequential changes through confirmation instead of writing them directly.

# 2. Product thesis

The intended operating loop is:

> Reality → Direction → Planning → Today → Outcomes → Evidence → Adaptation

The repository supports parts of every stage except model-powered adaptation:

- **Reality — Partially implemented.** Onboarding captures a free-text current-reality draft; Calendar, Actions, outcomes, and Life records capture more concrete facts. The onboarding answer is not interpreted or confirmed into Life (`components/clarity/onboarding-flow.tsx`, `app/onboarding/actions.ts`).
- **Direction — Foundation only.** `current_directions` and ordered goal relationships are canonical, but no intelligence synthesizes or revises them (`supabase/migrations/20260826000002_onboarding_life_model_foundation_v1.sql`, `lib/clarity/life-model.ts`).
- **Planning — Implemented deterministically.** Shape Today creates, edits, orders, and approves a plan, but its initial proposal is a mock (`lib/clarity/daily-loop-service.ts`, `components/clarity/proposed-plan.tsx`).
- **Today — Implemented.** Active Today chooses a next unresolved Action while respecting near-term commitments and retains accepted order (`components/clarity/active-today.tsx`, `lib/clarity/active-today-scheduling.ts`, `lib/clarity/today-commitment-priority.ts`).
- **Outcomes and evidence — Implemented.** Completion, progress, missed/no-longer-needed outcomes, Calendar occurrence results, actual duration, completed evidence, Day Records, and auditable correction paths exist (`supabase/migrations/20260819000003_historical_outcome_corrections_v1.sql`, `20260904000001_completed_plan_evidence_fields.sql`).
- **Adaptation — Not implemented as intelligence.** Carry-over and return handling are deterministic. No model learns from evidence, updates a recommendation, or persists memory.

The screen responsibilities are intentionally separate:

- **Today** is present attention and execution.
- **Calendar** is the date/time view over commitments and the same dated Actions.
- **Clarity** is intended to be the single reasoning and conversation surface; today it is a shell.
- **Life** is confirmed canonical understanding, not a transcript or unconfirmed inference.

These boundaries are encoded in `docs/clarity-intelligence-v1.md`, `lib/clarity/ai/clarity-context.ts`, and the confirmation requirements in `lib/clarity/ai/clarity-orchestrator.ts`.

# 3. Complete user journey

## Authentication

**Implemented.** Email/password sign-up, login, confirmation, password reset, and cookie-backed Supabase SSR sessions are routed under `app/auth/`. Private application routes are guarded by `lib/supabase/proxy.ts`; stale/rotated refresh tokens become a login redirect rather than a generic render failure, covered by `lib/supabase/proxy-routes.test.mjs`.

## Onboarding

**Partially implemented.** An incomplete account enters `/onboarding`, moving through Welcome → Name → personalized welcome → Current Reality → conversation placeholder. Each live transition saves an `onboarding_sessions.user_draft`; Preview uses component-local state at `/dev/onboarding` (`app/onboarding/page.tsx`, `components/clarity/onboarding-flow.tsx`, `lib/clarity/onboarding-service.ts`). There is no completion/confirmation turn, no interpretation, and no canonical Life write.

## Return, Catch Up, and Quick Recap

**Implemented deterministically.** The database classifies one unresolved recent day as Quick Recap, 2–7 missed/unresolved days as Catch Up, 8+ as Get Current, and a boundary through yesterday as ready (`supabase/migrations/20260825000002_return_boundary_v1.sql`, `lib/clarity/previous-day-routing.ts`). Catch Up records a neutral boundary and redirects to Today without inventing outcomes (`components/clarity/return-gap-context.tsx`, `app/(app)/today/day-transition-actions.ts`).

## Shape Today

**Implemented with mock generation.** `/today/shape` establishes the current-day plan boundary, generates a deterministic proposal, then `/today/plan` supports review, field editing, removal/restoration, completed evidence, flexible-Action ordering, and approval (`app/(app)/today/shape/page.tsx`, `app/(app)/today/plan/page.tsx`, `components/clarity/proposed-plan.tsx`). Earlier timed items, future fixed items, and flexible Actions are presented according to temporal behavior. The proposal itself is not intelligent.

## Active Today

**Implemented.** `/today/active` displays the next unresolved Action, brings approaching commitments forward as constraints, preserves accepted Action order, supports completion and occurrence-only removal, and starts day closing (`components/clarity/active-today.tsx`, `lib/clarity/active-today-scheduling.ts`). It does not silently reorder an accepted day.

## Calendar and Action workspace

**Implemented.** Calendar supports Events, Deadlines, recurrence, reminders, occurrence outcomes, and dated Action projections. Tapping an Action opens `/today/actions/[actionId]`; Calendar commitments remain in their own expansion/edit flow (`components/clarity/calendar-agenda.tsx`, `components/clarity/action-workspace.tsx`). “Ask Clarity” attaches only the Action ID and reloads owned data server-side (`components/clarity/action-detail.tsx`, `app/(app)/clarity/page.tsx`).

## Day close, history, and Life

**Implemented with limits.** Day closing records explicit outcomes and a Day Record, which Calendar can render as historical activity (`components/clarity/close-day-form.tsx`, `components/clarity/day-summary.tsx`, `components/clarity/calendar-history.tsx`). Life reads a canonical aggregate and permits factual corrections; strategic additions use a manual proposal/confirmation flow (`components/clarity/life-model-view.tsx`, `components/clarity/add-to-life-flow.tsx`). Clarity does not yet generate those proposals.

## Clarity tab

**Foundation only.** `/clarity` displays its purpose and optional attached context. It has no composer, provider, streamed response, thread, or memory (`app/(app)/clarity/page.tsx`, `lib/clarity/clarity-intelligence-skeleton.test.mjs`).

# 4. Onboarding

- **Welcome — Implemented:** concise authenticated entry with “Start” (`components/clarity/onboarding-flow.tsx`).
- **Name — Implemented as draft:** inline validation and a detected browser timezone are stored in the session draft. The live action does not currently call `saveOnboardingIdentity`; therefore the new name is not committed to `profiles.name` by this step (`app/onboarding/actions.ts`, `lib/clarity/onboarding-service.ts`).
- **Personalized welcome — Implemented:** a user-controlled transition; Back returns to Name without timer behavior (`components/clarity/onboarding-flow.tsx`).
- **Current Reality — Implemented as draft:** one required free-text answer, including explicit “I don’t know” recognition, is saved to the resumable session (`lib/clarity/onboarding.ts`, `app/onboarding/actions.ts`).
- **Conversation boundary — Foundation only:** the final screen explicitly says the conversational stage is not ready and nothing has been added to Life (`components/clarity/onboarding-flow.tsx`). There is no completion action, so a new user cannot finish the intended intelligent onboarding in this build.
- **Identity foundation — Foundation only/partially wired:** the local migration adds profile date of birth, city, country, and the ownership-safe `save_onboarding_identity_step_v1`, but the current sparse flow does not collect those fields or call that RPC (`supabase/migrations/20260827000001_onboarding_identity_v1.sql`, `lib/clarity/onboarding-service.ts`).
- **Resume — Implemented:** the latest in-progress `onboarding_sessions.current_step` and `user_draft` drive the live route (`lib/clarity/onboarding-service.ts`).
- **Preview — Implemented:** `/dev/onboarding` is available only in development or with `NEXT_PUBLIC_ENABLE_ONBOARDING_PREVIEW=true`; it requires authentication but uses local component state, does not invoke live server actions, and provides a local screen-jump menu (`app/dev/onboarding/page.tsx`, `lib/clarity/onboarding-preview.ts`, `components/clarity/onboarding-flow.tsx`, `lib/clarity/onboarding-v1.test.mjs`).
- **Adaptive questioning, synthesis, and proposal creation — Not implemented.** The reasoning policy describes the future behavior, but no model/provider or proposal builder consumes the onboarding answer (`lib/clarity/ai/reasoning-policy.ts`).

Expected authority boundary: an answer remains workflow draft; a model may later propose structured Life changes; only explicit confirmation may make them canonical. Database support for that boundary exists in `life_model_change_proposals`, `source_proposal_id`, and `confirm_life_model_change_proposal` (`supabase/migrations/20260826000002_onboarding_life_model_foundation_v1.sql`).

# 5. Today / Daily Loop

## Plan lifecycle

**Implemented.** `daily_plans.status` moves through `unshaped`, `proposed`, `active`, `closing`, and `closed`; one plan is unique per user/local date (`supabase/migrations/20260726000001_daily_loop.sql`). Server route guards keep `/shape`, `/plan`, `/active`, `/close`, and `/summary` aligned with that state (`app/(app)/today/route-guards.ts`).

## Proposed plan and grouping

**Implemented.** Shape Today partitions unresolved timed data into Earlier Today and Fixed Today and keeps only untimed proposed Actions in the flexible list. Both timed Daily Actions and Calendar commitments participate without domain conversion; links still open the correct workspace (`lib/clarity/shape-today-items.ts`, `components/clarity/proposed-plan.tsx`, `components/clarity/timed-day-item-summary.tsx`).

**Known limitation:** initial Actions and focus are hard-coded by `MockClarityAI`; this is deterministic scaffolding, not personalization (`lib/clarity/ai/mock-clarity-ai.ts`).

## Reordering

**Implemented in source.** Reorder mode collapses editors, exposes handle-only drag for unfinished untimed proposed Actions, constrains timed anchors, persists exact Action IDs through `reorder_proposed_daily_actions`, and rolls back optimistic order on failure (`components/clarity/proposed-plan.tsx`, `lib/clarity/proposed-action-ordering.ts`, `supabase/migrations/20260831000001_reorder_proposed_daily_actions.sql`). The RPC preserves existing sort slots and rejects wrong ownership, stale sets, prior-day plans, active plans, duplicates, and nonchronological timed Actions.

## Late-day shaping

**Implemented.** The same current calendar day remains authoritative. In late night the gateway says the plan is for the rest of the weekday and routes through normal Shape Today, not a separate “tonight” state (`lib/clarity/today-gateway.ts`, `lib/clarity/today-gateway.test.mjs`). Passed timed items require concise outcome handling before approval.

## Active Today

**Implemented.** Accepted `sort_order` normally selects the first unresolved Action. Near-term commitments can surface as Coming Up without rewriting the accepted Action order; later commitments remain visible chronologically (`lib/clarity/active-today-scheduling.ts`, `lib/clarity/today-commitment-priority.ts`, `components/clarity/active-today.tsx`).

## Outcomes and removal

**Implemented.** Actions can be completed/uncompleted, removed occurrence-only from Today, restored, rescheduled, or resolved during day closing. Historical reconciliation records Done, Some progress, Didn’t happen, and No longer needed semantics without deleting approved planning history (`supabase/migrations/20260727000003_remove_action_from_today.sql`, `20260728000001_day_transition.sql`, `components/clarity/recap-action-panel.tsx`).

## Closing and summary

**Implemented.** Closing snapshots progress, requires explicit unfinished outcomes, writes a Day Record/summary, and supports same-day undo/cancel safeguards (`components/clarity/close-day-form.tsx`, `components/clarity/day-summary.tsx`, `supabase/migrations/20260728000005_undo_close_snapshot.sql`, `20260731000001_cancel_day_closing.sql`).

## Return Boundary

**Implemented.** The database classifier and `start_current_day_v2` share the same profile-local return state. Neutral Catch Up/Get Current boundaries supersede older unresolved plans for blocking purposes without closing or mutating those plans (`supabase/migrations/20260825000002_return_boundary_v1.sql`, `lib/clarity/return-boundary-v1.test.mjs`).

## Quick Recap and evidence

**Implemented.** A single recent unresolved approved day uses Quick Recap. Planned Actions keep immutable planning identity while outcomes can be reconciled; actual duration is optional for Done/Some progress; completion time can remain unknown/Anytime; day reflection remains separate (`components/clarity/recap-experience.tsx`, `components/clarity/previous-day-catch-up.tsx`, `lib/clarity/quick-recap-actual-duration.test.mjs`).

**Implemented.** User-added completed evidence uses a `completion_evidence_only` Daily Action with nullable `actual_minutes` and `details`, plus edit and canonical swipe/explicit removal paths (`supabase/migrations/20260904000001_completed_plan_evidence_fields.sql`, `components/clarity/so-far-today.tsx`, `lib/clarity/completed-plan-evidence.test.mjs`).

# 6. Calendar

## Commitments and recurrence

**Implemented.** Calendar Events have a required start time and optional duration; Deadlines may be date-only or have a due time. Both support details, status, reminders, Life relationships, and recurrence (`supabase/migrations/20260805000001_calendar_commitments.sql`, `components/clarity/calendar-commitment-form.tsx`). Calendar recurrence has interval/unit/weekday rules for daily, weekly, monthly, yearly, and Custom; occurrence evaluation is date-based (`supabase/migrations/20260820000001_calendar_recurrence_rule_storage.sql`, `20260820000002_calendar_recurrence_rule_execution.sql`, `lib/clarity/calendar-recurrence.ts`).

## Occurrence outcomes

**Implemented.** Occurrence outcomes are stored separately from the recurring commitment. User-facing attended values map to Completed, actual completion time is occurrence-specific, and past/current-day corrections append revision history while future correction is rejected (`supabase/migrations/20260819000001_calendar_occurrence_completion_history.sql`, `20260825000004_allow_current_day_occurrence_correction.sql`, `components/clarity/calendar-agenda.tsx`). “Skip this occurrence” records an occurrence result rather than deleting the series.

## Actions in Calendar

**Implemented.** Calendar queries `daily_actions` by canonical `local_date` and user ID, then groups the same rows into Scheduled actions, Due, and Actions. It does not copy or deduplicate them by title (`lib/clarity/calendar-service.ts`, `lib/clarity/calendar-daily-actions.ts`, `components/clarity/calendar-daily-actions.tsx`). Proposed/unaccepted Actions are not shown as past history; accepted and reconciled results remain tied to the same Action ID.

**Implemented.** Action Due is a projection of `daily_actions.due_local_date`/`due_local_time`, not a generated Calendar Deadline (`supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql`, `lib/clarity/calendar-daily-actions.ts`).

**Implemented in source.** Adding an Action from a future Calendar date calls the universal Action creation path with that `local_date`; the Action can exist without a Daily Plan and later attach to the matching plan (`components/clarity/calendar-agenda.tsx`, `lib/clarity/action-workspace-service.ts`).

## History

**Implemented.** Closed Day Records, action outcome revisions, completed evidence, return-gap acknowledgement, day reflection, and Day Corrections appear on historical dates (`lib/clarity/calendar-service.ts`, `components/clarity/calendar-history.tsx`). A plan without a final Day Summary truthfully says no final summary was recorded.

## Genuine limitations

- **Known limitation:** old records depend on all relevant migrations and normalization having reached the target database; the repository alone cannot prove remote migration state.
- **Known limitation:** Calendar commitment recurrence and Routine-generated repeating Actions are intentionally separate systems; legacy commitments are not converted into Routines.
- **Known limitation:** Calendar has no general free-form “day intelligence”; it displays deterministic records and corrections.
- **Known limitation:** some historical Daily Action rows are read-only when no current/future workspace mutation is valid (`components/clarity/calendar-daily-actions.tsx`).

# 7. Universal Action system

The canonical user-facing field set is:

1. What
2. When
3. Duration
4. Due
5. Repeats
6. Reminders
7. Details

**Implemented in source.** `ActionFields` is reused by Add Action, proposed/active Action edit, and add/edit completed activity, with contextual hiding rather than separate field implementations (`components/clarity/action-fields.tsx`, `components/clarity/add-action-form.tsx`, `components/clarity/action-workspace.tsx`, `components/clarity/so-far-today.tsx`). Collapsed rows are compact; the shared Duration input deterministically parses forms such as `30m` and `1h 15m` (`components/clarity/time-spent-field.tsx`, `lib/clarity/duration.ts`).

- **Planned semantics:** When is optional scheduled time; Duration is estimated effort; Due may be date-only; reminders require a real When or exact Due time.
- **Completed semantics:** When is actual completion time and may remain Anytime; Duration is actual time; reminders are hidden for a completed standalone occurrence and become relevant only when a repeat creates future intent (`components/clarity/action-fields.tsx`).
- **Canonical date:** `daily_actions.local_date` owns the profile-local occurrence date. `daily_plan_id` is optional membership, not identity (`supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql`).
- **Same identity:** Today and Calendar point to the same Action ID; URL context never carries authoritative title/details (`lib/clarity/calendar-service.ts`, `lib/clarity/clarity-action-context.ts`).
- **Future Actions:** can exist without a plan, then attach/materialize at the relevant planning boundary (`lib/clarity/action-workspace-service.ts`, convergence migration).
- **Completed evidence:** remains a specialized Daily Action flag with honest `actual_minutes`, not an estimated-duration overload (`20260904000001_completed_plan_evidence_fields.sql`).
- **Workspace:** owner-scoped server loading exposes title, status, scheduled/due data, duration, details, Goal/Project/Routine relationships, updates, and contextual edit/remove controls (`lib/clarity/daily-loop-queries.ts`, `components/clarity/action-detail.tsx`, `components/clarity/action-workspace.tsx`).
- **Ask Clarity:** produces `/clarity?context=action&actionId=<uuid>`; `/clarity` validates the UUID and re-fetches the row with `user_id = auth user`, so user-supplied labels are not trusted (`lib/clarity/clarity-action-context.ts`, `app/(app)/clarity/page.tsx`, `lib/clarity/clarity-action-context.test.mjs`).

# 8. Recurrence

**Implemented in source/schema:** a repeating Action is represented by a canonical `routines` definition plus separate dated `daily_actions` occurrences linked by `source_routine_id`. It is not one immortal Action (`supabase/migrations/20260904000002_action_occurrence_convergence_v1.sql`).

- **Daily:** applies on every date at/after `routines.start_on`.
- **Weekly:** applies every seven days from the canonical Action/recurrence anchor date, so an Action started Thursday recurs Thursday.
- **Custom/certain days:** materializes on the explicitly selected weekdays.
- **One date at a time:** `materialize_routine_action_occurrences(p_local_date)` rejects retrospective dates, locks owned definitions/plan rows, and inserts at most one `(user_id, source_routine_id, local_date)` occurrence.
- **Unassigned definitions:** `routines.life_area_id` may be null, allowing repeating behavior before Life classification; unassigned routines cannot claim Goal/Project children.
- **Occurrence removal:** removing one dated occurrence does not end the Routine; update/remove RPCs preserve or detach future series behavior according to explicit recurrence edits (`create_action_occurrence_v1`, `update_action_occurrence_v1`, `remove_action_occurrence_v1` in the convergence migration).
- **`times_per_week` — Known limitation:** the Life schema can store it, but deterministic occurrence materialization intentionally returns false because choosing which dates is a planning decision. It is not silently converted to weekdays (`private.routine_occurs_on_date` in the convergence migration).

**Implemented separately:** recurring Calendar commitments use Calendar recurrence rules and occurrence outcomes (`lib/clarity/calendar-recurrence.ts`, `supabase/migrations/20260820000002_calendar_recurrence_rule_execution.sql`).

**Known limitation:** `daily_actions.recurrence_pattern` and `recurrence_days` remain as legacy compatibility metadata, even though new universal recurrence is realized through Routines. They are not removed or auto-migrated because old intent cannot be reinterpreted safely without user confirmation (`lib/clarity/action-recurrence.ts`, `supabase/migrations/20260727000002_contextual_actions.sql`).

# 9. Reminders and notifications

## Storage and scheduling

- **Implemented in source/schema:** Calendar reminders live on `calendar_commitments.reminder_offsets_minutes`; Action reminders live on `daily_actions.reminder_offsets_minutes`, while repeating defaults can live on the Routine (`20260816000001_notifications_foundation.sql`, `20260904000002_action_occurrence_convergence_v1.sql`).
- **Implemented:** zero means At start time, positive values are before the anchor, and date-only items cannot fabricate a clock-time reminder (`20260825000001_at_start_time_reminders.sql`, `lib/clarity/calendar-reminders.ts`).
- **Implemented:** `notification_deliveries` has an explicit target constraint: a delivery targets one Calendar commitment or one Action, with idempotency keys preventing duplicate occurrence/offset/subscription sends (notification foundation and convergence migrations).
- **Implemented:** materialization, leasing/claim, immediate revalidation, retry classification, terminal failure, and success recording are split across SQL and `lib/clarity/notification-dispatch-core.ts`/`notification-dispatcher.ts`.
- **Implemented:** service-worker push display and safe deep-link handling exist in `public/sw.js`, `public/notification-sw-utils.js`, and `lib/clarity/service-worker-notifications.test.mjs`.

## Ownership and operations

**Implemented:** subscriptions are registered/disabled through authenticated RPCs; the delivery table is forced-RLS and hidden from authenticated clients. The dispatcher alone uses a service-role client (`lib/clarity/notification-service.ts`, `lib/supabase/admin.ts`, `20260816000001_notifications_foundation.sql`). The HTTP endpoint requires a constant-time checked `CRON_SECRET` bearer (`app/api/notifications/dispatch/route.ts`, `lib/clarity/notification-dispatch-http.ts`).

**Partially implemented operationally:** enabling push requires `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`; dispatch additionally requires `SUPABASE_SERVICE_ROLE_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, and `CRON_SECRET` (`lib/clarity/push-subscription-client.ts`, `lib/clarity/notification-dispatcher.ts`). The SQL cron migration targets a fixed Vercel production URL and a Vault secret (`20260817000001_notification_cron_scheduler.sql`).

**Remote configuration not checked.** This audit did not inspect Vercel or Supabase secrets. Repository tests prove scheduling and dispatch logic with fakes; they do not prove an actual iPhone subscription received a production push. Preview and Production may differ because environment variables and the service-role/cron path are deployment configuration, not source-controlled state.

# 10. Life Model

## Canonical records

**Implemented in schema and read model:**

- Life Areas and one Current State per area;
- Desired State;
- Goals and append-only Goal decisions;
- Projects, including parent Project and optional Goal;
- Routines;
- Current Context;
- Open Questions;
- Evidence with optional Action, Calendar occurrence, or Day Correction provenance;
- one current Current Direction with ordered Goal relationships.

Sources: `supabase/migrations/20260818000001_life_model_v1.sql`, `20260826000002_onboarding_life_model_foundation_v1.sql`, `lib/clarity/life-model.ts`.

## UI and mutation behavior

**Implemented.** `/life-model` is read-first: compact area cards show Where you are, Where you want to be, Goals, Projects, Routines, relevant Current Context, Still figuring out, and a collapsed supporting-detail/evidence area. Empty sections are omitted (`components/clarity/life-model-view.tsx`).

**Implemented.** Direct authenticated mutations cover factual correction and lifecycle transitions: area rename/archive, current-state updates, Goal/Project/Routine/Context edits and status transitions, and Evidence correction/archive. Terminal-state and active-child constraints are enforced in SQL (`20260826000001_life_model_canonical_mutations_v1.sql`, `lib/clarity/life-model-mutations.ts`). Goal UI preserves hidden target metadata on ordinary edits rather than clearing it (`app/(app)/life-model/actions.ts`).

## Proposal boundary

**Implemented deterministically.** “Talk to Clarity” currently opens a structured manual proposal builder, not a conversation. It creates `life_model_change_proposals`, shows a review screen, and only `confirm_life_model_change_proposal` applies allow-listed operations atomically. Rejecting creates no canonical mutation (`components/clarity/add-to-life-flow.tsx`, `components/clarity/life-proposal-review.tsx`, `app/(app)/life-model/proposal-actions.ts`). New items do not enter Current Direction unless that change is explicitly included.

**Not implemented:** broad, deeply populated user knowledge. The database can represent the concepts, but Clarity does not infer them from onboarding, automatically create Evidence, synthesize a direction, or maintain them from ongoing conversation.

# 11. Clarity intelligence skeleton

- **`/clarity` — Foundation only:** permanent Compass navigation destination and an honest empty conversation state (`components/clarity/bottom-navigation.tsx`, `app/(app)/clarity/page.tsx`).
- **One Clarity concept — Implemented in naming/navigation:** there is no user-facing Mentor or Assistant tab; specialized internal names remain implementation artifacts (`lib/clarity/user-facing-intelligence-naming.test.mjs`).
- **Action/day invocation — Implemented as context foundation:** validated Action UUID or ISO date only; canonical data is reloaded server-side. There are no Action-specific chat threads (`lib/clarity/clarity-action-context.ts`, `app/(app)/clarity/page.tsx`).
- **Context contracts — Foundation only:** typed Life, Today, Calendar, Return, memory, and verified external-world sources are defined but not composed at runtime (`lib/clarity/ai/clarity-context.ts`).
- **Memory contracts — Foundation only:** conversation, working context, episodes, decisions, evidence, and summaries have epistemic labels; no store implements `ClarityMemorySource`, and `/clarity` persists no messages (`lib/clarity/ai/clarity-memory.ts`, `docs/clarity-intelligence-v1.md`).
- **Orchestrator next moves — Foundation only:** ask, clarify, research, explore, recommend, propose Action/Life change, synthesize, and confirm are typed outputs; no `ClarityOrchestrator` implementation exists (`lib/clarity/ai/clarity-orchestrator.ts`).
- **Opportunity analysis and scenario forecasting — Foundation only:** qualitative evaluation/forecast interfaces exist; there is no engine or provider (`lib/clarity/ai/opportunity-analysis.ts`).
- **Research boundary — Foundation only:** consequential changing facts must be externally verified, but no research integration exists (`lib/clarity/ai/clarity-context.ts`, `docs/clarity-intelligence-v1.md`).
- **Reasoning policy — Foundation only:** grounded agency, reality-first reasoning, option expansion, leverage, evidence, tone, and adaptive onboarding are codified provider-neutrally (`lib/clarity/ai/reasoning-policy.ts`).
- **Authority boundary — Foundation plus real Life confirmation:** model output is designed to propose; application code validates; user confirmation applies consequential change. Only the Life proposal ledger exists today; there is no general Action/Calendar proposal ledger (`lib/clarity/ai/clarity-orchestrator.ts`, Life proposal migration).

These contracts are **not a connected model-powered intelligence**. The only class implementing `ClarityAI` in the live service default is a deterministic mock (`lib/clarity/ai/mock-clarity-ai.ts`, `lib/clarity/daily-loop-service.ts`).

# 12. Data model and source of truth

| Record | Canonical responsibility | Views/projections |
|---|---|---|
| `profiles` | Auth-owned name, planning timezone, onboarding flags/identity metadata | Header, local-date calculations, onboarding defaults |
| `daily_plans` | One local-date plan and its lifecycle/focus | Shape Today, Active Today, return classification |
| `daily_actions` | One concrete dated Action occurrence, outcome, timing, estimate/actual duration, Due, details, optional plan and Life/Routine links | Today and Calendar use the same row/ID |
| `routines` | Canonical repeating-behavior definition | Produces independent dated Actions one date at a time |
| `calendar_commitments` | Event/Deadline series definition and schedule | Calendar and Today constraint views |
| `calendar_commitment_occurrences` | Outcome for one commitment/date | Completed/Missed/Cancelled/Skipped state in Today/Calendar |
| occurrence/action revision tables | Append-only correction audit | Current historical presentation is derived from latest truth plus revisions |
| `day_records` | Final Day Summary snapshot and day note/context | Today Summary and Calendar history |
| `day_corrections` | Additive historical completed item/event/day-note correction | Past Calendar/recap evidence |
| `return_gap_records` | Neutral “current through date” boundary | Today return routing; never an inferred outcome |
| Life tables | Confirmed canonical Areas, states, Goals, Projects, Routines, Contexts, Questions, Evidence, Direction | `get_life_model()` and `/life-model` |
| `notification_deliveries` | Idempotent dispatch work and status | Dispatcher only; not a user-editable record |
| `life_model_change_proposals` | Unconfirmed, reviewable Life operations | Proposal review and atomic confirmation |
| `onboarding_sessions` | Resumable workflow draft | `/onboarding`; explicitly not canonical Life |
| `product_events` | Bounded product event log | Internal lifecycle telemetry |

Primary definitions are in `20260726000001_daily_loop.sql`, `20260805000001_calendar_commitments.sql`, `20260818000001_life_model_v1.sql`, `20260826000002_onboarding_life_model_foundation_v1.sql`, and `20260904000002_action_occurrence_convergence_v1.sql`.

The central projection rule is important: Calendar does not create a copy of a Daily Action. It selects the owner’s dated `daily_actions` row. A Calendar commitment is not converted into an Action merely because Today displays it beside Actions (`lib/clarity/calendar-service.ts`, `lib/clarity/daily-loop-queries.ts`).

# 13. Authentication, ownership, and safety

- **Authentication — Implemented:** Supabase Auth sessions are refreshed/verified server-side. Protected routes redirect to login; the dispatch endpoint alone bypasses user-session proxy because it has separate bearer authorization (`lib/supabase/proxy.ts`, `lib/supabase/proxy-routes.ts`).
- **RLS/ownership — Implemented in schema:** primary user tables enable and force RLS or hide direct writes, and security-definer RPCs begin with `auth.uid()` plus owned-row checks. Representative migrations: Daily Loop, Calendar, notifications, Life, onboarding, and convergence migrations.
- **Action context — Implemented safely:** query strings contain an ID, never authoritative title/status/project data. Workspace loading filters both `id` and `user_id`; a missing/foreign row is treated as not found (`lib/clarity/daily-loop-queries.ts`, `app/(app)/clarity/page.tsx`).
- **Day context — Implemented safely:** the ISO date is validated, then Calendar service queries plans/Actions/corrections for the authenticated user (`lib/clarity/clarity-action-context.ts`, `lib/clarity/calendar-service.ts`).
- **Proposal confirmation — Implemented for Life:** proposal shape is allow-listed in SQL, AI-confirmed provenance requires a matching proposal, confirmation locks and applies atomically, and rejection does not mutate canonical Life (`20260826000002_onboarding_life_model_foundation_v1.sql`).
- **Refresh-token resilience — Implemented:** `getClaims()` failure becomes unauthenticated redirect and updated cookies/headers are returned together (`lib/supabase/proxy.ts`).
- **Authority policy — Foundation only for future intelligence:** the model may reason/propose; application rules validate and enforce; the user confirms consequential Action, Life, Direction, and Calendar changes (`lib/clarity/ai/clarity-orchestrator.ts`, `docs/clarity-intelligence-v1.md`).
- **Known limitation:** SQL safety tests are often static source assertions. They catch missing grants/guards but do not substitute for executing every migration against PostgreSQL (`lib/clarity/*migration*.test.mjs`).

# 14. Migration state

There are 49 local SQL migrations. This audit read local files only and did **not** contact or mutate a Supabase project. Consequently:

- **Exists locally:** all migrations below.
- **Confirmed remote during this audit:** none.
- **Remote state not checked:** all migrations below. Git does not record Supabase migration application state.

Earlier dogfood or deployment behavior is not sufficient evidence to mark an individual migration applied. Before a release, compare the linked project’s migration ledger read-only; do not infer from source availability.

| Migration | Local purpose | Remote state |
|---|---|---|
| `20260726000001_daily_loop.sql` | Profiles, plans, Actions, Day Records, product events, core lifecycle RPCs | Not checked |
| `20260726000002_same_day_undo.sql` | Same-day Day Close undo | Not checked |
| `20260727000001_action_workspace.sql` | Action workspace, notes, legacy assistant-message table, edit/reschedule/adapt RPCs | Not checked |
| `20260727000002_contextual_actions.sql` | Context/legacy recurrence metadata and context decision | Not checked |
| `20260727000003_remove_action_from_today.sql` | Occurrence-only remove/replace behavior | Not checked |
| `20260728000001_day_transition.sql` | Honest completion timestamps, historical day/reconciliation | Not checked |
| `20260728000002_catch_up_refinement.sql` | Refined prior-day reconciliation | Not checked |
| `20260728000003_product_event_names.sql` | Expanded event-name allow-list | Not checked |
| `20260728000004_delete_action_note.sql` | Owned Action-note delete | Not checked |
| `20260728000005_undo_close_snapshot.sql` | Closing snapshot and safe undo | Not checked |
| `20260728000006_correct_completion_time.sql` | Completion-time correction | Not checked |
| `20260729000001_direct_catch_up_resolutions.sql` | Direct recap resolutions and initial return-gap records | Not checked |
| `20260730000001_quick_recap_closed.sql` | Quick Recap of closed plans | Not checked |
| `20260730000002_day_transition_integrity.sql` | Recap/return-gap integrity | Not checked |
| `20260731000001_cancel_day_closing.sql` | Cancel closing | Not checked |
| `20260801000001_overnight_day_boundary.sql` | Overnight/day-start state foundation | Not checked |
| `20260802000001_optional_shape_wake.sql` | Optional wake time in shaping | Not checked |
| `20260802000002_start_current_day_boundary.sql` | Authoritative current-day start guard | Not checked |
| `20260803000001_previous_day_gap_boundary.sql` | Previous-day/gap boundary | Not checked |
| `20260803000002_context_only_shape_today.sql` | Context-only Shape Today proposal save | Not checked |
| `20260803000003_open_day_approval.sql` | Empty/open plan approval path | Not checked |
| `20260803000004_restore_removed_proposed_actions.sql` | Restore proposed Actions | Not checked |
| `20260803000005_fix_restore_removed_sort_order.sql` | Collision-safe restored ordering | Not checked |
| `20260803000006_complete_proposed_action.sql` | Complete during proposed plan | Not checked |
| `20260803000007_restore_action_to_today.sql` | Restore removed current Action | Not checked |
| `20260805000001_calendar_commitments.sql` | Calendar Event/Deadline definitions and RPCs | Not checked |
| `20260805000002_day_corrections.sql` | Additive historical corrections/day notes | Not checked |
| `20260807000001_proposed_plan_reconciliation.sql` | Proposed reconciliation, completed evidence, occurrence outcomes | Not checked |
| `20260815000001_fix_return_gap_action_state.sql` | Return-gap Action-state fix | Not checked |
| `20260816000001_notifications_foundation.sql` | Subscriptions, deliveries, reminder storage | Not checked |
| `20260816000002_notification_delivery_dispatch.sql` | Materialize/claim/revalidate/send-result RPCs | Not checked |
| `20260817000001_notification_cron_scheduler.sql` | Minute cron and Vault bearer lookup | Not checked |
| `20260818000001_life_model_v1.sql` | Canonical Life tables, relationships, read model | Not checked |
| `20260819000001_calendar_occurrence_completion_history.sql` | Completion timestamps and occurrence revision audit | Not checked |
| `20260819000002_fix_calendar_undo_capability_flag.sql` | Non-null undo capability at read boundary | Not checked |
| `20260819000003_historical_outcome_corrections_v1.sql` | Audited Action/Calendar historical corrections | Not checked |
| `20260820000001_calendar_recurrence_rule_storage.sql` | Interval/unit/weekday recurrence storage | Not checked |
| `20260820000002_calendar_recurrence_rule_execution.sql` | Recurrence execution across reads/outcomes/notifications | Not checked |
| `20260825000001_at_start_time_reminders.sql` | Valid zero-offset reminder and delivery window | Not checked |
| `20260825000002_return_boundary_v1.sql` | Shared classifier, neutral boundaries, start guard | Not checked |
| `20260825000003_allow_return_boundary_product_event.sql` | Allows `return_boundary_recorded` event | Not checked |
| `20260825000004_allow_current_day_occurrence_correction.sql` | Past/today occurrence correction; future rejected | Not checked |
| `20260826000001_life_model_canonical_mutations_v1.sql` | Ownership-safe Life corrections/transitions | Not checked |
| `20260826000002_onboarding_life_model_foundation_v1.sql` | Desired states, questions, Direction, proposals, sessions | Not checked |
| `20260827000001_onboarding_identity_v1.sql` | Profile identity fields and identity-step RPC | Not checked |
| `20260831000001_reorder_proposed_daily_actions.sql` | Collision-safe exact-set proposed Action reorder | Not checked |
| `20260901000001_routine_daily_action_occurrences.sql` | Initial Routine-to-plan occurrence materialization | Not checked |
| `20260904000001_completed_plan_evidence_fields.sql` | Honest actual duration/details for completed evidence | Not checked |
| `20260904000002_action_occurrence_convergence_v1.sql` | Dated Action convergence, Routine creation/materialization, Action reminders | Not checked |

The generated client types include the converged schema/RPC shapes in `lib/supabase/database.types.ts`, but generated types are also not proof of remote application.

# 15. Test and validation state

This repository uses Node’s built-in test runner across 69 `*.test.mjs` files, plus TypeScript, ESLint, and a Next production build. The tests combine pure unit tests, mocked service tests, and many static source/migration contract assertions.

Validation for this audit is recorded after the document is written:

- **Focused Duration/form tests:** 39 passed, 0 failed.
- **Complete repository suite:** 530 passed, 0 failed.
- **TypeScript:** `npx tsc --noEmit` passed with no diagnostics.
- **ESLint:** `npm run lint` passed with no diagnostics.
- **Production build:** the normal Turbopack build reached the expected network-only Google Fonts failure; the same production build passed with webpack and the local deterministic Geist response fixture (34 static/dynamic routes generated).
- **Whitespace:** `git diff --check` passed.

Strongly covered areas include local-date/time helpers, Today routing and return classification, Action ordering constraints, recurrence calculations, reminder scheduling/dispatch state machines, form composition, ownership-shaped SQL definitions, Life proposal shape, and context URL validation (`lib/clarity/*.test.mjs`, `lib/supabase/*.test.mjs`).

Areas still dependent on manual iPhone/PWA validation include native date/time picker behavior, safe-area composition, touch drag/reorder feel, swipe-vs-scroll arbitration, installed-PWA keyboard/navigation behavior, Notification permission/subscription prompts, and actual push receipt.

**Known limitation:** `app/layout.tsx` imports Geist from Google through `next/font/google`. In a network-restricted build environment, the standard build can fail fetching font CSS. The repository does not contain a committed font fixture; local validation can provide Next’s `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` fixture and run webpack deterministically. This tests the application build but is not the same as eliminating the external font dependency.

# 16. Current known problems / technical debt

1. **No real intelligence.** `MockClarityAI` hard-codes an example day and `/clarity` cannot converse. This is the dominant product gap.
2. **Onboarding cannot finish the intended flow.** It saves a draft and stops at a placeholder. The current name step does not call the identity RPC, and no answer becomes a reviewed Life proposal.
3. **Memory is not persisted.** Memory types exist, but there is no conversation table/runtime/retriever for the Clarity relationship.
4. **No population learning.** There is no consent, de-identification, aggregate store, evaluation feedback loop, or cross-user strategy learning; the architecture explicitly defers it (`docs/clarity-intelligence-v1.md`).
5. **Notifications are operationally unproven.** Source logic is broad, but environment secrets, cron/Vault configuration, subscription state, and actual iPhone delivery were not verified in this audit. The fixed production URL in the cron migration adds deployment coupling.
6. **Remote migration state is unknown.** The five newest foundations—onboarding identity, reorder, Routine occurrences, completed evidence fields, and convergence—exist locally, but this audit has no remote ledger evidence.
7. **Legacy recurrence fields remain.** `daily_actions.recurrence_pattern/days` coexist for compatibility with canonical Routine recurrence. The intended new path is clean, but future maintenance must prevent old RPCs/UI from reviving competing semantics.
8. **Old Calendar/history records may be heterogeneous.** Successive migrations normalize presentation and corrections, but older remote rows depend on migrations actually being applied and on historical data satisfying newer assumptions.
9. **Action provenance is incomplete.** `source_routine_id`, Life relationships, `relationship_source`, completion-evidence flag, original input, and reschedule lineage reveal some origins. Manually added versus mock/Clarity-proposed Actions do not have a single explicit authoritative origin field.
10. **No general operational proposal ledger.** Life changes have atomic proposals; Action/Calendar/Direction proposal types exist only in the orchestrator contract. There is no persisted confirm/reject mechanism for general Clarity operations.
11. **Dormant legacy assistant storage exists.** `action_assistant_messages` and `save_action_assistant_exchange` were created early, while the accepted architecture is one persistent Clarity conversation. They should not become separate per-Action chats (`20260727000001_action_workspace.sql`).
12. **Life depth is schema-heavy, data-light.** Canonical structures and mutations are extensive, but automated evidence ingestion, onboarding synthesis, direction recommendation, and routine classification are absent.
13. **Test style has blind spots.** Static regex tests are useful regression alarms but do not validate PostgreSQL parsing, RLS behavior against a real database, browser interaction physics, or deployment configuration.
14. **README is stale.** `README.md` is still the generic Next/Supabase starter and does not explain Clarity setup, required environment variables, migrations, validation, or operational runbooks.
15. **UI consistency needs device proof.** The universal Action form was recently compacted. Due/native controls, reminders, Custom weekdays, and completed edit need a final real-iPhone pass despite passing source/UI tests.

# 17. Intelligence readiness

## Foundations that exist

- **Adaptive onboarding:** resumable draft, explicit-unknown representation, canonical proposal tables, atomic confirmation, and reasoning policy exist (`onboarding_sessions`, `life_model_change_proposals`, `lib/clarity/ai/reasoning-policy.ts`).
- **Intelligent Shape Today:** canonical Today/Calendar/Return/Life context shapes, a provider-neutral `ClarityAI` boundary, structured plan validation, and safe plan-save RPCs exist (`lib/clarity/ai/clarity-ai.ts`, `lib/clarity/schemas.ts`, `daily-loop-service.ts`).
- **Contextual Ask Clarity:** Action/date invocation and owner-scoped canonical reload are implemented.
- **Intelligent Catch Up:** neutral return boundaries and deterministic recap persistence exist; interpreter interfaces and mocks identify a replaceable seam (`lib/clarity/ai/return-recap-interpreter.ts`, `daily-loop-service.ts`).
- **Weekly planning:** Life/Routine/Calendar/date foundations can supply context, and `weekly_review` is named as an invocation surface. No weekly planning product/runtime exists.
- **Proposal-confirmed changes:** Life has a real ledger and confirmation path. Orchestrator contracts require confirmation for Action, Direction, and Calendar changes, but their general ledgers are absent.
- **Long-term memory:** epistemic categories, source references, and retrieval interfaces are specified. No persistence is implemented.

## Required before the first real Clarity turn

1. A provider-neutral adapter with explicit model/version/config and safe secret handling.
2. A strict one-turn request/response schema around `ClarityOrchestratorResult` and validation/repair/failure behavior.
3. An authenticated context assembler that loads only requested canonical domains and budgets context.
4. A persistent one-conversation-per-user, append-only message design and reviewed migration.
5. A concrete memory implementation or an explicit first-turn policy with no memory.
6. Tool/application handlers that convert typed proposals into reviewable operations; no direct model writes.
7. Prompt-injection/data-boundary handling for user text and any external research.
8. Evaluation fixtures for onboarding follow-ups, Today plans, refusal to fabricate facts, confirmation discipline, timezone behavior, and cross-user isolation.
9. Observability for latency, token/cost, parse failures, proposal acceptance, and safe redaction.
10. Replacement of `MockClarityAI` in product paths without leaving hard-coded sample Actions reachable in production.

# 18. V1 completion plan

## Required for first beta — approximately 30 days

1. **Days 1–2: final phone validation and only actual bugs.** Run Add/Edit/completed Action, Due, recurrence, reminder, Shape Today reorder, Calendar occurrence, Catch Up, onboarding Preview, and PWA auth flows on real iPhone. Reconcile the remote migration ledger before testing source that depends on it.
2. **Days 3–5: provider-neutral runtime.** Implement one server-only model adapter, timeouts, retries, structured-output validation, safe logs, and a mock for tests. Do not bind domain code to one vendor.
3. **Days 5–7: one-turn intelligence contract.** Wire `ClarityOrchestratorRequest/Result`, limited context loading, failure UX, and confirmation-only mutation outputs. Start with no tools except read-only canonical context.
4. **Days 8–11: adaptive onboarding conversation.** Replace the placeholder with one best next question at a time; keep every extraction unconfirmed and resumable.
5. **Days 11–13: onboarding synthesis/review.** Produce a grouped proposed Reality/Life/unknowns summary and let the user correct it before any canonical write.
6. **Days 13–15: confirmed Life and Direction creation.** Translate accepted synthesis through the existing Life proposal RPC. Current Direction must be explicit and reviewable.
7. **Days 16–19: intelligent Shape Today.** Replace hard-coded actions with a validated proposal grounded in Direction, Calendar, capacity, evidence, and current time. Preserve manual edit/order/approval.
8. **Days 19–22: persistent Clarity conversation.** Add reviewed ownership-safe conversation/message persistence; one relationship per user, contextual subjects per turn, no per-Action bot.
9. **Days 22–24: memory/retrieval V1.** Store source-linked episodes/decisions/summaries with epistemic status; retrieve narrowly and allow user correction.
10. **Days 24–25: contextual Action/day turns.** Use existing invocation links to seed the same conversation with canonical context.
11. **Days 26–27: Catch Up intelligence.** Let the user describe change naturally, propose bounded updates, and still permit the neutral deterministic boundary.
12. **Days 28–30: evaluations and first beta.** Golden scenarios, adversarial authority tests, timezone regression, cost/latency budgets, notification/device smoke tests, runbook, error monitoring, and a small invited cohort.

## Useful immediately after beta

- Weekly planning/review driven by evidence and Current Direction.
- General Action/Calendar proposal ledger and grouped confirmation UX.
- External research adapter with citations and jurisdiction/effective-date handling.
- Better provenance and model-run observability.
- Notification preferences, delivery diagnostics, and operational dashboards.

## Deliberately deferred

- Multi-agent/user-visible specialist personas.
- Autonomous canonical mutations or silent day reshuffling.
- Population learning without explicit consent and de-identification design.
- Advanced recurrence such as third Wednesday/business-day rules.
- Forecast probabilities unsupported by evidence.
- A broad Roadmap, Opportunity Engine UI, voice, or speculative automation before the core loop earns trust.

# 19. Internal differentiation hypotheses

These are product hypotheses supported by the architecture, not proven market claims:

- **Closed-loop hypothesis:** connecting Reality → Action → Outcome → Evidence → Adaptation could make recommendations more grounded than a plan-only experience. Outcomes and evidence exist; adaptation does not.
- **Single-Action hypothesis:** one canonical Action viewed in Today and Calendar can reduce sync ambiguity and give intelligence a clearer history (`daily_actions.local_date`, Calendar projection).
- **Canonical-Life hypothesis:** separating confirmed Life truth from draft conversation/inference can make personalization correctable and safer (`created_via`, proposals, confirmations).
- **Direction hypothesis:** a current accepted strategy with ordered Goals may keep daily recommendations focused rather than treating all stored goals equally.
- **Evidence-based planning hypothesis:** actual outcomes/durations, commitment results, and Day Records can make capacity and next-move reasoning longitudinal rather than aspirational.
- **Contextual-Clarity hypothesis:** one persistent Clarity relationship that can attach an Action or day may be more coherent than fragmented object-specific assistants.
- **Proposal boundary hypothesis:** reason → propose → confirm → deterministically apply can preserve user authority while still enabling meaningful automation.
- **Longitudinal-learning hypothesis:** source-linked, epistemically labeled memory could improve recommendations over time without silently rewriting canonical truth. It is not built yet.
- **Opportunity-reasoning hypothesis:** qualitative option value, reversibility, evidence, downside, and time-to-evidence contracts could support higher-leverage choices. They are types, not a working engine.

None of these is an established moat. They require a reliable model runtime, accepted user value, high-quality memory, evaluations, and longitudinal outcomes to become differentiation.

# 20. Final readiness score

| Area | Score | Reason |
|---|---:|---|
| Deterministic product foundation | **8/10** | The Daily Loop, Calendar, universal dated Actions, recurrence, outcomes, Return Boundary, Life schema, and proposal safety form a coherent foundation. Remote migration alignment and some legacy seams remain. |
| Mobile UX consistency | **6.5/10** | The shell, safe areas, compact disclosures, swipe controls, and shared Action form are intentionally mobile-first, but recent changes still need real-device proof and native controls remain platform-sensitive. |
| Intelligence implementation | **1.5/10** | Strong contracts and policy exist, but production behavior is a hard-coded mock and `/clarity` has no conversation. |
| Memory implementation | **1/10** | Categories and interface exist; no persistent Clarity conversation, episodic store, compression, or retrieval implementation exists. |
| Safety/authority boundaries | **8/10** | Auth/RLS, owner-scoped reads, secure RPCs, additive corrections, neutral Return Boundaries, and atomic Life confirmation are strong. Real-DB integration tests and a general operational proposal ledger are missing. |
| Beta readiness | **4.5/10** | A deterministic dogfood beta is plausible after migration/config/device verification. The promised intelligent experience is not beta-ready. |
| Long-term vision completion | **3/10** | The data and authority architecture anticipates the vision, but adaptive reasoning, conversation, memory, learning, and opportunity execution remain to be built. |

The honest conclusion: Clarity has a credible operating-system skeleton and unusually complete deterministic truth/safety foundations. It does not yet have the intelligence that makes the product thesis come alive.
