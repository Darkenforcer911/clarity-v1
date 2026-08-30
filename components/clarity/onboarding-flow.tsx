"use client";

import { ArrowLeft, ArrowRight, Check, MoreHorizontal, Sparkles } from "lucide-react";
import {
  useActionState,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  continueFromNameWelcomeAction,
  moveOnboardingBackAction,
  saveCurrentRealityAction,
  saveOnboardingNameAction,
  startOnboardingAction,
} from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialOnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import type { OnboardingPageState } from "@/lib/clarity/onboarding-service";
import type { OnboardingStep } from "@/lib/clarity/onboarding";
import { PendingButton } from "./pending-button";

type OnboardingMode = "live" | "preview";

const inputClassName =
  "h-13 rounded-2xl border-white/15 bg-white/[0.07] px-4 shadow-none backdrop-blur-sm focus-visible:ring-[#63c8ff]";
const simpleStepContentClassName =
  "flex flex-1 items-start pb-8 pt-[clamp(2.5rem,7svh,4rem)]";

export function OnboardingLoading() {
  return (
    <main className="min-h-svh bg-[#041329] text-foreground">
      <div
        className="mx-auto grid min-h-svh w-full max-w-[480px] place-items-center border-x-0 border-border bg-background px-5 min-[481px]:border-x"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="size-3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        <span className="sr-only">Loading onboarding</span>
      </div>
    </main>
  );
}

export function OnboardingFlow({
  initialState,
  mode,
}: {
  initialState: OnboardingPageState;
  mode: OnboardingMode;
}) {
  const [step, setStep] = useState<OnboardingStep>(initialState.step);
  const [identity, setIdentity] = useState(initialState.draft.identity);
  const [currentReality, setCurrentReality] = useState(
    initialState.draft.responses.currentReality.answer,
  );
  const [previewErrors, setPreviewErrors] = useState<{
    name?: string;
    currentReality?: string;
  }>({});
  const [startState, startAction] = useActionState(
    startOnboardingAction,
    initialOnboardingActionState,
  );
  const [nameState, nameAction] = useActionState(
    saveOnboardingNameAction,
    initialOnboardingActionState,
  );
  const [welcomeState, welcomeAction] = useActionState(
    continueFromNameWelcomeAction,
    initialOnboardingActionState,
  );
  const [realityState, realityAction] = useActionState(
    saveCurrentRealityAction,
    initialOnboardingActionState,
  );
  const [, backAction] = useActionState(
    moveOnboardingBackAction,
    initialOnboardingActionState,
  );

  useEffect(() => {
    if (initialState.draft.identity.timezone !== "UTC") return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected) return;

    const frame = window.requestAnimationFrame(() => {
      setIdentity((current) => ({ ...current, timezone: detected }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialState.draft.identity.timezone]);

  const preview = mode === "preview";

  function previewTransition(event: FormEvent<HTMLFormElement>, next: OnboardingStep) {
    if (!preview) return;
    event.preventDefault();

    if (step === "name" && next === "name_welcome" && !identity.name.trim()) {
      setPreviewErrors({ name: "Enter your name to continue." });
      return;
    }

    if (
      step === "current_reality" &&
      next === "conversation_shell" &&
      currentReality.trim().length < 2
    ) {
      setPreviewErrors({
        currentReality:
          "Tell Clarity a little about what your life looks like right now.",
      });
      return;
    }

    setPreviewErrors({});
    setStep(next);
  }

  function previewBack(event: FormEvent<HTMLFormElement>) {
    if (!preview) return;
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("step");
    if (value === "entry" || value === "name" || value === "current_reality") {
      setStep(value);
    }
  }

  function previewJump(next: OnboardingStep) {
    if (!preview) return;
    setPreviewErrors({});
    setStep(next);
  }

  return (
    <main className="min-h-svh overflow-x-clip bg-[#041329] text-foreground">
      <div
        className="relative mx-auto min-h-svh w-full max-w-[480px] overflow-x-clip border-x-0 border-border bg-background min-[481px]:border-x"
      >
        <div className="relative flex min-h-svh flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:px-7">
          <OnboardingTopBar
            preview={preview}
            onPreviewJump={previewJump}
          />

          {step === "entry" && (
            <EntryScreen
              preview={preview}
              action={startAction}
              onSubmit={(event) => previewTransition(event, "name")}
              error={startState.status === "error" ? startState.message : null}
            />
          )}

          {step === "name" && (
            <NameScreen
              name={identity.name}
              timezone={identity.timezone}
              onNameChange={(name) => {
                setIdentity((current) => ({ ...current, name }));
                if (name.trim()) {
                  setPreviewErrors((current) => ({ ...current, name: undefined }));
                }
              }}
              previewError={previewErrors.name}
              preview={preview}
              action={nameAction}
              state={nameState}
              backAction={backAction}
              onSubmit={(event) => previewTransition(event, "name_welcome")}
              onBack={previewBack}
            />
          )}

          {step === "name_welcome" && (
            <NameWelcomeScreen
              name={identity.name}
              preview={preview}
              action={welcomeAction}
              error={welcomeState.status === "error" ? welcomeState.message : null}
              backAction={backAction}
              onSubmit={(event) => previewTransition(event, "current_reality")}
              onBack={previewBack}
            />
          )}

          {step === "current_reality" && (
            <CurrentRealityScreen
              name={identity.name}
              value={currentReality}
              onChange={(value) => {
                setCurrentReality(value);
                if (value.trim().length >= 2) {
                  setPreviewErrors((current) => ({
                    ...current,
                    currentReality: undefined,
                  }));
                }
              }}
              previewError={previewErrors.currentReality}
              preview={preview}
              action={realityAction}
              state={realityState}
              backAction={backAction}
              onSubmit={(event) => previewTransition(event, "conversation_shell")}
              onBack={previewBack}
            />
          )}

          {step === "conversation_shell" && (
            <ConversationShellScreen
              preview={preview}
              backAction={backAction}
              onBack={previewBack}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function OnboardingTopBar({
  preview,
  onPreviewJump,
}: {
  preview: boolean;
  onPreviewJump: (step: OnboardingStep) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em] text-white">
        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
        Clarity
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {preview && (
          <>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Preview
            </span>
            <PreviewNavigation onJump={onPreviewJump} />
          </>
        )}
      </div>
    </div>
  );
}

function PreviewNavigation({
  onJump,
}: {
  onJump: (step: OnboardingStep) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 rounded-xl"
          aria-label="Jump to onboarding screen"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-2xl border-border bg-card p-2 text-foreground"
      >
        <DropdownMenuItem onSelect={() => onJump("entry")} className="min-h-11 rounded-xl">
          Welcome
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onJump("name")} className="min-h-11 rounded-xl">
          Name
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onJump("name_welcome")} className="min-h-11 rounded-xl">
          Personal welcome
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onJump("current_reality")} className="min-h-11 rounded-xl">
          Your reality
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onJump("conversation_shell")} className="min-h-11 rounded-xl">
          Conversation shell
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EntryScreen({
  preview,
  action,
  onSubmit,
  error,
}: {
  preview: boolean;
  action: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
}) {
  return (
    <section className="flex min-h-0 flex-1 text-center">
      <div className="w-full pb-8 pt-[clamp(3rem,8svh,4.5rem)]">
        <div className="mx-auto max-w-sm space-y-4">
          <h1 className="text-[2.625rem] font-semibold leading-[1.08] tracking-[-0.055em] text-white sm:text-5xl">
            Turn where you are into where you want to be.
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Tell Clarity where you are. It’ll help you work out what matters
            next.
          </p>
        </div>
        <form
          action={preview ? undefined : action}
          onSubmit={onSubmit}
          className="mx-auto mt-7 w-full max-w-sm"
        >
          <PendingButton
            pendingLabel="Starting…"
            className="h-14 w-full rounded-2xl text-base shadow-sm"
          >
            Start
          </PendingButton>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function NameScreen({
  name,
  timezone,
  onNameChange,
  previewError,
  preview,
  action,
  state,
  backAction,
  onSubmit,
  onBack,
}: {
  name: string;
  timezone: string;
  onNameChange: (name: string) => void;
  previewError?: string;
  preview: boolean;
  action: (formData: FormData) => void;
  state: typeof initialOnboardingActionState;
  backAction: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldError = previewError ?? state.fieldErrors?.name?.[0];

  return (
    <section className="flex min-h-0 flex-1 flex-col pt-4">
      <BackControl step="entry" preview={preview} action={backAction} onSubmit={onBack} />
      <div className={simpleStepContentClassName}>
        <div className="w-full">
          <header>
            <h1 className="text-4xl font-semibold tracking-[-0.05em]">
              What should I call you?
            </h1>
          </header>

          <form
            action={preview ? undefined : action}
            onSubmit={onSubmit}
            noValidate
            className="mt-6 space-y-5"
          >
            <input type="hidden" name="timezone" value={timezone} />
            <div className="space-y-2">
              <Input
                aria-label="Name"
                name="name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                className={inputClassName}
                autoComplete="name"
                autoFocus
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "onboarding-name-error" : undefined}
              />
              {fieldError && (
                <p id="onboarding-name-error" className="text-xs text-destructive">
                  {fieldError}
                </p>
              )}
            </div>
            {state.status === "error" && state.message && !state.fieldErrors && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            <PendingButton
              pendingLabel="Saving…"
              className="h-13 w-full rounded-2xl text-base"
            >
              Continue <ArrowRight />
            </PendingButton>
          </form>
        </div>
      </div>
    </section>
  );
}

function CurrentRealityScreen({
  name,
  value,
  onChange,
  previewError,
  preview,
  action,
  state,
  backAction,
  onSubmit,
  onBack,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  previewError?: string;
  preview: boolean;
  action: (formData: FormData) => void;
  state: typeof initialOnboardingActionState;
  backAction: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldError =
    previewError ?? state.fieldErrors?.currentReality?.[0];

  return (
    <section className="flex flex-1 flex-col pt-4">
      <BackControl step="name" preview={preview} action={backAction} onSubmit={onBack} />
      <header className="mt-7 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78d2ff]">Your reality</p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          {name.trim()
            ? `${name.trim()}, give me the real picture of your life right now.`
            : "Give me the real picture of your life right now."}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          What do you do for work or money? What takes up most of your week?
          What else has a real effect on how you live?
        </p>
      </header>

      <form
        action={preview ? undefined : action}
        onSubmit={onSubmit}
        noValidate
        className="mt-7 flex flex-1 flex-col"
      >
        <div className="space-y-4">
          <label className="block">
            <Textarea
              name="currentReality"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-52 resize-y rounded-2xl border-white/15 bg-white/[0.07] p-4 text-base leading-7 shadow-none backdrop-blur-sm focus-visible:ring-[#63c8ff]"
              placeholder="Just tell me normally. I’ll work it out from there."
              autoFocus
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "onboarding-reality-error" : undefined}
            />
          </label>
          {fieldError && (
            <p id="onboarding-reality-error" className="text-xs text-destructive">
              {fieldError}
            </p>
          )}
        </div>

        <div className="mt-auto pt-8">
          {state.status === "error" && state.message && !state.fieldErrors && <p role="alert" className="mb-3 text-sm text-destructive">{state.message}</p>}
          <PendingButton pendingLabel="Saving…" className="h-13 w-full rounded-2xl text-base">
            Continue <ArrowRight />
          </PendingButton>
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            This stays a draft until you review and confirm what Clarity understood.
          </p>
        </div>
      </form>
    </section>
  );
}

function NameWelcomeScreen({
  name,
  preview,
  action,
  error,
  backAction,
  onSubmit,
  onBack,
}: {
  name: string;
  preview: boolean;
  action: (formData: FormData) => void;
  error: string | null;
  backAction: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col pt-4">
      <BackControl step="name" preview={preview} action={backAction} onSubmit={onBack} />
      <div className={`${simpleStepContentClassName} text-center`}>
        <div className="w-full space-y-7">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">
              Welcome{name.trim() ? `, ${name.trim()}` : ""}.
            </h1>
            <p className="mx-auto max-w-sm text-base leading-7 text-muted-foreground">
              Everyone’s in a different position. Let’s understand yours.
            </p>
          </div>
          <form
            action={preview ? undefined : action}
            onSubmit={onSubmit}
            className="mx-auto w-full max-w-sm"
          >
            <PendingButton
              pendingLabel="Loading…"
              className="h-13 w-full rounded-2xl text-base"
            >
              Next <ArrowRight />
            </PendingButton>
          </form>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ConversationShellScreen({
  preview,
  backAction,
  onBack,
}: {
  preview: boolean;
  backAction: (formData: FormData) => void;
  onBack: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="grid size-20 place-items-center rounded-full border border-[#78d2ff]/35 bg-[#2196f3]/15 shadow-[0_0_40px_rgba(33,150,243,0.28)]">
        <Check className="size-9 text-[#78d2ff]" />
      </div>
      <div className="mt-7 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78d2ff]">
          {preview ? "Conversation shell" : "A clear starting point"}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.045em]">
          {preview
            ? "Adaptive conversation begins here"
            : "Your starting point is saved"}
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
          {preview
            ? "This development placeholder marks the handoff to the future adaptive Clarity conversation."
            : "Your answer is safely saved. Clarity will continue from here when the conversational onboarding stage is ready."}
        </p>
      </div>
      <div className="mt-9 w-full rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left backdrop-blur-sm">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-[#78d2ff]" />
          <p className="text-sm leading-6 text-muted-foreground">
            Nothing has been added to your Life yet. You’ll correct and confirm the full picture first.
          </p>
        </div>
      </div>
      <form action={preview ? undefined : backAction} onSubmit={onBack} className="mt-7 w-full">
        <input type="hidden" name="step" value="current_reality" />
        <Button type="submit" variant="secondary" className="h-12 w-full rounded-2xl">
          Review my answer
        </Button>
      </form>
    </section>
  );
}

function BackControl({
  step,
  preview,
  action,
  onSubmit,
}: {
  step: "entry" | "name" | "current_reality";
  preview: boolean;
  action: (formData: FormData) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form action={preview ? undefined : action} onSubmit={onSubmit}>
      <input type="hidden" name="step" value={step} />
      <button type="submit" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" /> Back
      </button>
    </form>
  );
}
