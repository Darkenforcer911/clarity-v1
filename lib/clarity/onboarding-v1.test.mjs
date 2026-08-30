import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CURRENT_REALITY_QUESTION_ID,
  emptyOnboardingDraft,
  isExplicitUnknown,
  parseOnboardingDraft,
  parseOnboardingStep,
} from "./onboarding.ts";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const migration = read(
  "../../supabase/migrations/20260827000001_onboarding_identity_v1.sql",
);
const flow = read("../../components/clarity/onboarding-flow.tsx");
const actions = read("../../app/onboarding/actions.ts");
const service = read("./onboarding-service.ts");
const page = read("../../app/onboarding/page.tsx");
const previewPage = read("../../app/dev/onboarding/page.tsx");
const previewGate = read("./onboarding-preview.ts");
const accountMenu = read("../../components/clarity/account-menu.tsx");
const appShell = read("../../components/clarity/app-shell.tsx");
const appLayout = read("../../app/(app)/layout.tsx");

test("the onboarding draft preserves identity, exact authored reality, and explicit unknowns", () => {
  const draft = emptyOnboardingDraft({ name: "Ahmed", timezone: "Australia/Melbourne" });
  const exactAnswer = "I work rotating hours and study when I can.  ";
  draft.responses.currentReality = {
    questionId: CURRENT_REALITY_QUESTION_ID,
    answer: exactAnswer,
    explicitUnknown: false,
    answeredAt: "2026-08-27T01:00:00.000Z",
  };

  const parsed = parseOnboardingDraft(structuredClone(draft));
  assert.equal(parsed.identity.name, "Ahmed");
  assert.equal(parsed.identity.timezone, "Australia/Melbourne");
  assert.equal(parsed.responses.currentReality.answer, exactAnswer);
  assert.equal(parsed.unconfirmedExtraction, null);
  assert.equal(isExplicitUnknown("I don't know"), true);
  assert.equal(parseOnboardingStep("name"), "name");
  assert.equal(parseOnboardingStep("name_welcome"), "name_welcome");
  assert.equal(parseOnboardingStep("current_reality"), "current_reality");
  assert.equal(parseOnboardingStep("conversation_shell"), "conversation_shell");
  assert.equal(parseOnboardingStep("identity"), "name");
  assert.equal(parseOnboardingStep("foundation_complete"), "conversation_shell");
  assert.equal(parseOnboardingStep("unsupported"), "entry");
});

test("the forward migration adds canonical identity fields and saves identity with the draft atomically", () => {
  assert.match(migration, /alter table public\.profiles[\s\S]*add column date_of_birth date/i);
  assert.match(migration, /add column city text/i);
  assert.match(migration, /add column country text/i);
  assert.match(migration, /create function public\.save_onboarding_identity_step_v1\(/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /update public\.profiles[\s\S]*name = btrim\(p_name\)[\s\S]*timezone = p_timezone/i);
  assert.match(migration, /update public\.onboarding_sessions[\s\S]*current_step = 'current_reality'[\s\S]*user_draft = p_user_draft/i);
  assert.match(migration, /insert into public\.onboarding_sessions/i);
  assert.match(migration, /grant execute on function public\.save_onboarding_identity_step_v1/i);
});

test("existing accounts are grandfathered while future profiles retain the existing false default", () => {
  assert.match(migration, /update public\.profiles[\s\S]*set onboarding_completed = true[\s\S]*where onboarding_completed = false/i);
  assert.doesNotMatch(migration, /alter column onboarding_completed set default true/i);
});

test("app-open records the observed device timezone without replacing planning timezone", () => {
  const functionStart = migration.indexOf(
    "create or replace function public.record_app_opened",
  );
  const functionEnd = migration.indexOf("\n$$;", functionStart);
  const body = migration.slice(functionStart, functionEnd);

  assert.match(body, /observedDeviceTimezone/i);
  assert.match(body, /set last_active_at = now\(\)/i);
  assert.doesNotMatch(body, /set[\s\S]*timezone\s*=\s*p_timezone/i);
});

test("entry screen is a clean Clarity welcome without experimental artwork", () => {
  assert.match(flow, /Turn where you are into where you want to be\./);
  assert.match(
    flow,
    /Tell Clarity where you are\. It’ll help you work out what matters[\s\S]*next\./,
  );
  assert.doesNotMatch(flow, /Clarity understands your situation/);
  assert.match(flow, />\s*Start\s*<\/PendingButton>/);
  assert.doesNotMatch(flow, /You’ll review everything before it’s added to your Life\./);
  assert.match(flow, /max-w-\[480px\]/);
  assert.match(flow, /min-\[481px\]:border-x/);
  assert.match(flow, /border-border bg-background/);
  assert.match(flow, /size-2\.5 rounded-full bg-primary/);
  assert.doesNotMatch(flow, /left-1\/2 -translate-x-1\/2|text-\[#2488df\]/);
  assert.doesNotMatch(flow, /radial-gradient/);
  assert.doesNotMatch(
    flow,
    /NeuralField|neuralStyles|<svg|<canvas|WebGL|three\.js|nucleus|orbit|particle/i,
  );
  assert.match(flow, /env\(safe-area-inset-top\)/);
  assert.match(flow, /env\(safe-area-inset-bottom\)/);
  assert.match(flow, /pt-\[clamp\(3rem,8svh,4\.5rem\)\]/);
  assert.match(flow, /text-\[2\.625rem\][\s\S]*leading-\[1\.08\]/);
  assert.match(flow, /className="mx-auto mt-7 w-full max-w-sm"/);
});

test("Name hands off through a user-controlled personalized welcome", () => {
  const transition = flow.slice(
    flow.indexOf("function NameWelcomeScreen"),
    flow.indexOf("function ConversationShellScreen"),
  );

  assert.match(flow, /What should I call you\?/);
  assert.match(flow, /pt-\[clamp\(2\.5rem,7svh,4rem\)\]/);
  assert.doesNotMatch(flow, /flex flex-1 items-center py-10/);
  assert.doesNotMatch(flow, /First, you/);
  assert.doesNotMatch(flow, /1 of 2|2 of 2/);
  assert.match(actions, /saveOnboardingStep\("name", state\.draft\)/);
  assert.match(actions, /saveOnboardingStep\("name_welcome", draft\)/);
  assert.match(actions, /saveOnboardingStep\("current_reality", state\.draft\)/);
  assert.doesNotMatch(actions, /saveOnboardingIdentity/);
  assert.match(service, /save_onboarding_identity_step_v1/);
  assert.doesNotMatch(flow, /When were you born\?|Where are you based\?|Planning timezone/);
  assert.match(flow, /Welcome\{name\.trim\(\) \? `, \$\{name\.trim\(\)\}` : ""\}\./);
  assert.match(
    flow,
    /Everyone’s in a different position\. Let’s understand yours\./,
  );
  assert.match(transition, />\s*Next <ArrowRight \/>\s*<\/PendingButton>/);
  assert.match(transition, /<BackControl step="name"/);
  assert.doesNotMatch(transition, /setTimeout|setInterval|animate-in|fade-in/);
  assert.match(flow, /give me the real picture of your life right now\./);
  assert.match(
    flow,
    /What do you do for work or money\? What takes up most of your week\?[\s\S]*What else has a real effect on how you live\?/,
  );
  assert.match(flow, /Just tell me normally\. I’ll work it out from there\./);
  assert.doesNotMatch(flow, /See an example|Work, study, regular commitments/);
  assert.doesNotMatch(flow, /weekly_demand_hours|\brigidity\b|set_current_state/);
});

test("required onboarding answers use inline Clarity validation", () => {
  assert.ok(
    (flow.match(/\bnoValidate\b/g) ?? []).length >= 2,
    "Name and Your Reality forms should opt out of native browser validation",
  );
  assert.doesNotMatch(flow, /\brequired\b/);
  assert.match(actions, /Enter your name to continue\./);
  assert.match(
    actions,
    /Tell Clarity a little about what your life looks like right now\./,
  );
  assert.match(flow, /previewErrors/);
  assert.match(flow, /identity\.name\.trim\(\)/);
  assert.match(flow, /currentReality\.trim\(\)\.length < 2/);
  assert.match(flow, /aria-invalid=\{Boolean\(fieldError\)\}/);
});

test("answers save only to onboarding workflow state in this slice", () => {
  assert.match(actions, /saveOnboardingStep\("conversation_shell", draft\)/);
  assert.match(service, /rpc\("save_onboarding_session"/);
  assert.doesNotMatch(
    `${actions}\n${service}`,
    /confirm_life_model_change_proposal|insert into public\.(life_areas|goals|projects|routines)/i,
  );
});

test("the adaptive conversation screen remains a development placeholder only", () => {
  assert.match(
    flow,
    /preview[\s\S]{0,80}?"Adaptive conversation begins here"[\s\S]{0,80}?"Your starting point is saved"/,
  );
  assert.match(
    flow,
    /This development placeholder marks the handoff to the future adaptive Clarity conversation\./,
  );
});

test("refresh resumes from the single in-progress session", () => {
  assert.match(service, /from\("onboarding_sessions"\)/);
  assert.match(service, /\.eq\("status", "in_progress"\)/);
  assert.match(service, /parseOnboardingStep\(session\.current_step\)/);
  assert.match(service, /parseOnboardingDraft\(session\.user_draft/);
  assert.match(page, /getOnboardingPageState\(\)/);
  assert.match(actions, /saveOnboardingStep\("name_welcome", draft\)/);
});

test("live onboarding is authenticated and completed users return to Today", () => {
  assert.match(page, /<Suspense fallback=\{<OnboardingLoading \/>\}>/);
  assert.match(page, /AuthenticationRequiredError/);
  assert.match(page, /redirect\("\/auth\/login"\)/);
  assert.match(page, /if \(state\.completed\) redirect\("\/today"\)/);
  assert.doesNotMatch(appLayout, /onboarding_completed|redirect\("\/onboarding"\)/);
});

test("environment-gated preview is isolated from persistence and production navigation", () => {
  assert.match(previewGate, /process\.env\.NODE_ENV === "development"/);
  assert.match(
    previewGate,
    /process\.env\.NEXT_PUBLIC_ENABLE_ONBOARDING_PREVIEW === "true"/,
  );
  assert.match(previewPage, /if \(!onboardingPreviewEnabled\) notFound\(\)/);
  assert.match(previewPage, /<Suspense fallback=\{<OnboardingLoading \/>\}>/);
  assert.match(previewPage, /mode="preview"/);
  assert.doesNotMatch(previewPage, /save_onboarding|confirm_life_model|update\(/i);
  assert.match(appLayout, /showOnboardingPreview=\{onboardingPreviewEnabled\}/);
  assert.match(appShell, /showOnboardingPreview = false/);
  assert.match(
    appShell,
    /<AccountMenu[\s\S]*showOnboardingPreview=\{showOnboardingPreview\}/,
  );
  assert.match(accountMenu, /\{showOnboardingPreview && \(/);
  assert.match(accountMenu, /href="\/dev\/onboarding"/);
  assert.doesNotMatch(accountMenu, /onboardingPreviewEnabled/);
  assert.match(flow, /action=\{preview \? undefined : action\}/);
  assert.match(flow, /function PreviewNavigation/);
  for (const label of [
    "Welcome",
    "Name",
    "Personal welcome",
    "Your reality",
    "Conversation shell",
  ]) {
    assert.match(flow, new RegExp(`>\\s*${label}\\s*<`));
  }
  assert.doesNotMatch(flow, />\s*Date of birth\s*</);
  assert.doesNotMatch(flow, />\s*Location\s*</);
  assert.match(flow, /if \(!preview\) return;[\s\S]*setStep\(next\)/);
  assert.doesNotMatch(flow, /scrollIntoView/);
});
