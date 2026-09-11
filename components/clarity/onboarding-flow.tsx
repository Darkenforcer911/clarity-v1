"use client";

import { ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  confirmOnboardingAction,
  retryOnboardingMessageAction,
  sendOnboardingMessageAction,
} from "@/app/onboarding/actions";
import { Textarea } from "@/components/ui/textarea";
import { initialOnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import type { OnboardingProgress } from "@/lib/clarity/onboarding-intelligence";
import type {
  OnboardingConversationMessage,
  OnboardingPageState,
} from "@/lib/clarity/onboarding-service";
import { PendingButton } from "./pending-button";

type OnboardingMode = "live" | "preview";

export function OnboardingLoading() {
  return (
    <main className="min-h-svh bg-[#041329] text-foreground">
      <div
        className="mx-auto grid min-h-svh w-full max-w-[560px] place-items-center border-x-0 border-border bg-background px-5 min-[561px]:border-x"
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
  const router = useRouter();
  const preview = mode === "preview";
  const [previewMessages, setPreviewMessages] = useState(initialState.messages);
  const [sendState, sendAction] = useActionState(
    sendOnboardingMessageAction,
    initialOnboardingActionState,
  );
  const [retryState, retryAction] = useActionState(
    retryOnboardingMessageAction,
    initialOnboardingActionState,
  );
  const [confirmState, confirmAction] = useActionState(
    confirmOnboardingAction,
    initialOnboardingActionState,
  );
  const endRef = useRef<HTMLDivElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const messages = preview ? previewMessages : initialState.messages;
  const synthesis =
    initialState.confirmedSnapshot?.synthesis ?? initialState.synthesis;
  const completed = initialState.status === "completed";
  const hasSynthesis = Boolean(synthesis);

  useEffect(() => {
    if (!sendState.completedAt || sendState.status !== "success") return;
    composerFormRef.current?.reset();
    router.refresh();
  }, [router, sendState.completedAt, sendState.status]);

  useEffect(() => {
    if (
      (!retryState.completedAt || retryState.status !== "success") &&
      (!confirmState.completedAt || confirmState.status !== "success")
    ) {
      return;
    }
    router.refresh();
  }, [
    confirmState.completedAt,
    confirmState.status,
    retryState.completedAt,
    retryState.status,
    router,
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, hasSynthesis]);

  function submitPreview(event: FormEvent<HTMLFormElement>) {
    if (!preview) return;
    event.preventDefault();
    const content = String(new FormData(event.currentTarget).get("message") ?? "").trim();
    if (!content) return;
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    setPreviewMessages((current) => [
      ...current,
      previewMessage(userId, "user", content, now),
      previewMessage(
        crypto.randomUUID(),
        "clarity",
        "What would you most want to be different a year from now?",
        now,
        userId,
      ),
    ]);
    event.currentTarget.reset();
  }

  return (
    <main className="min-h-svh overflow-x-clip bg-[#041329] text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col border-x-0 border-border bg-background min-[561px]:border-x">
        <header className="shrink-0 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <Link
              href="/today"
              className="flex items-center gap-2 rounded-lg text-lg font-semibold tracking-[-0.03em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
              Clarity
            </Link>
            {preview && (
              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </span>
            )}
          </div>
          <p className="mt-4 text-xs font-medium tracking-[0.04em] text-[#78d2ff]">
            ~5–10 min · Just a conversation · Skip anything
          </p>
          <h1 className="mt-3 text-[2.3rem] font-semibold leading-[1.08] tracking-[-0.055em] text-white sm:text-[2.65rem]">
            {completed ? "Your starting picture." : "Tell me about your life right now."}
          </h1>
          {!completed && (
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              What’s going well, what feels messy, and what are you trying to
              figure out? You can answer however you want.
            </p>
          )}
          {!completed && (
            <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
              You don’t need to have your life figured out. That’s what I’m here for.
            </p>
          )}
          {!completed && (
            <OnboardingProgressView progress={initialState.progress} />
          )}
        </header>

        <section
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 pb-5 sm:px-7"
          aria-label="First Understanding conversation"
        >
          {messages.length === 0 && !completed && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <div className="flex gap-3">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-[#78d2ff]" />
                <p className="text-sm leading-6 text-muted-foreground">
                  Start wherever feels most real. You don’t need to organise it,
                  and nothing is added to your Life until you review and confirm
                  what I understood.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3" aria-live="polite">
            {messages.map((message) => (
              <OnboardingMessage key={message.id} message={message} />
            ))}
          </div>

          {synthesis && <OnboardingSynthesisView synthesis={synthesis} />}

          {!completed && synthesis && initialState.sessionId && (
            <form action={preview ? undefined : confirmAction}>
              <input
                type="hidden"
                name="sessionId"
                value={initialState.sessionId}
              />
              <PendingButton
                pendingLabel="Confirming…"
                className="h-13 w-full rounded-2xl text-base"
                disabled={preview}
              >
                <Check /> This is accurate
              </PendingButton>
              <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
                If something is wrong or missing, just say so below and I’ll
                update the picture first.
              </p>
            </form>
          )}

          {completed && (
            <div className="pb-3 pt-1">
              <Link
                href="/today"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Continue to Today <ArrowRight className="size-4" />
              </Link>
            </div>
          )}

          <div ref={endRef} />
        </section>

        {!completed && (
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-7">
            {(sendState.fieldError || sendState.message) && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {sendState.fieldError ?? sendState.message}
              </p>
            )}
            {sendState.retryMessageId && sendState.message && (
              <form action={preview ? undefined : retryAction} className="mb-2">
                <input
                  type="hidden"
                  name="retryMessageId"
                  value={sendState.retryMessageId}
                />
                <PendingButton
                  variant="secondary"
                  size="sm"
                  pendingLabel="Retrying…"
                  disabled={preview}
                >
                  <RotateCcw className="size-4" /> Retry
                </PendingButton>
              </form>
            )}
            {(retryState.message || confirmState.message) && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {retryState.message ?? confirmState.message}
              </p>
            )}
            <form
              ref={composerFormRef}
              action={preview ? undefined : sendAction}
              onSubmit={submitPreview}
              className="rounded-2xl border border-border bg-card p-2 shadow-sm"
            >
              <Textarea
                name="message"
                placeholder="Tell Clarity…"
                aria-label="Tell Clarity"
                className="max-h-36 min-h-14 resize-none border-0 bg-transparent px-2 py-2 text-base leading-6 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <p className="text-[11px] text-muted-foreground">
                  Only the final picture is confirmed.
                </p>
                <PendingButton
                  size="icon"
                  pendingLabel="…"
                  className="size-10 shrink-0 rounded-xl"
                  aria-label="Send"
                >
                  <ArrowRight className="size-4" />
                </PendingButton>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

function OnboardingProgressView({ progress }: { progress: OnboardingProgress }) {
  const items = useMemo(
    () => [
      ["Your situation", progress.situation],
      ["What matters to you", progress.whatMatters],
      ["Where you want to go", progress.future],
      ["What could get in the way", progress.constraints],
    ] as const,
    [progress],
  );

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
      <p className="text-xs font-medium text-foreground">Building your picture…</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map(([label, state]) => (
          <span key={label} className="text-[11px] text-muted-foreground">
            {label} · {progressLabel(state)}
          </span>
        ))}
      </div>
    </div>
  );
}

function OnboardingMessage({
  message,
}: {
  message: OnboardingConversationMessage;
}) {
  const user = message.role === "user";
  return (
    <article
      className={
        user
          ? "ml-8 rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
          : "mr-5 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-foreground"
      }
    >
      {message.content}
    </article>
  );
}

function OnboardingSynthesisView({
  synthesis,
}: {
  synthesis: NonNullable<OnboardingPageState["synthesis"]>;
}) {
  const sections = [
    ["Where you are", synthesis.whereYouAre],
    ["What you want", synthesis.whatYouWant],
    ["What you have going for you", synthesis.whatYouHaveGoingForYou],
    ["What could get in the way", synthesis.whatCouldGetInTheWay],
    ["Still unsure", synthesis.stillUnsure],
    ["What matters first", synthesis.whatMattersFirst],
  ] as const;
  const horizons = [
    ["Long term · 3–5+ years", synthesis.horizons.longTerm],
    ["Mid term · 6–24 months", synthesis.horizons.midTerm],
    ["Short term · 30–90 days", synthesis.horizons.shortTerm],
    ["Current bottleneck", synthesis.horizons.bottleneck],
    ["Next move", synthesis.horizons.nextMove],
  ] as const;

  return (
    <section className="space-y-3 rounded-3xl border border-[#78d2ff]/25 bg-[#78d2ff]/[0.055] p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#78d2ff]">
          First Understanding
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
          The picture so far
        </h2>
      </div>
      <div className="space-y-4">
        {sections.map(([label, value]) => (
          <SynthesisSection key={label} label={label} value={value} />
        ))}
      </div>
      <div className="border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold">Where this points</h3>
        <div className="mt-3 space-y-3">
          {horizons.map(([label, value]) => (
            <SynthesisSection key={label} label={label} value={value} compact />
          ))}
        </div>
      </div>
    </section>
  );
}

function SynthesisSection({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </h3>
      <p className={compact ? "mt-1 text-sm leading-5" : "mt-1 text-sm leading-6"}>
        {value}
      </p>
    </div>
  );
}

function progressLabel(value: OnboardingProgress[keyof OnboardingProgress]) {
  if (value === "getting_clearer") return "getting clearer";
  if (value === "clear") return "clear";
  if (value === true) return "clear";
  if (value === false) return "learning";
  return "learning";
}

function previewMessage(
  id: string,
  role: "user" | "clarity",
  content: string,
  createdAt: string,
  responseToMessageId: string | null = null,
): OnboardingConversationMessage {
  return {
    id,
    onboarding_session_id: "00000000-0000-4000-8000-000000000001",
    role,
    content,
    created_at: createdAt,
    response_to_message_id: responseToMessageId,
    mode: role === "clarity" ? "CLARIFY" : null,
    structured_output: null,
  };
}
