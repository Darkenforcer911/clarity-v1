"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  confirmOnboardingAction,
  saveOnboardingBasicContextAction,
} from "@/app/onboarding/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClarityImageViewer,
  type ClarityViewerImage,
} from "@/components/clarity/clarity-image-viewer";
import { OnboardingConversationComposer } from "@/components/clarity/onboarding-conversation-composer";
import {
  clarityConversationBottom,
  isClarityHistoryNearBottom,
} from "@/lib/clarity/ai/clarity-chat-layout";
import { initialOnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import type {
  OnboardingConversationMessage,
  OnboardingPageState,
} from "@/lib/clarity/onboarding-service";
import { PendingButton } from "./pending-button";

type OnboardingMode = "live" | "preview";
type OnboardingStage = "basics" | "conversation";
type BasicStep = "welcome" | "name" | "birth" | "location";
type ImageViewerState = { images: ClarityViewerImage[]; index: number };

const inputClassName =
  "h-12 rounded-xl border-border bg-card px-3.5 shadow-none focus-visible:ring-ring";

export function OnboardingLoading() {
  return (
    <main className="min-h-svh bg-background text-foreground">
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
  const router = useRouter();
  const preview = mode === "preview";
  const [stage, setStage] = useState<OnboardingStage>(() =>
    initialState.basicContextComplete ? "conversation" : "basics",
  );
  const [basicStep, setBasicStep] = useState<BasicStep>("welcome");
  const [basicStepError, setBasicStepError] = useState<string | null>(null);
  const [basicContext, setBasicContext] = useState(() => ({
    preferredName: initialState.profile.preferredName,
    dateOfBirth: initialState.profile.dateOfBirth ?? "",
    city: initialState.profile.city,
    country: initialState.profile.country,
    timezone: initialState.profile.timezone,
  }));
  const [previewMessages, setPreviewMessages] = useState(initialState.messages);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [basicState, basicAction] = useActionState(
    saveOnboardingBasicContextAction,
    initialOnboardingActionState,
  );
  const [confirmState, confirmAction] = useActionState(
    confirmOnboardingAction,
    initialOnboardingActionState,
  );
  const conversationScrollRef = useRef<HTMLElement>(null);
  const historyNearBottomRef = useRef(true);
  const scrollAfterConversationChangeRef = useRef(false);
  const messages = preview ? previewMessages : initialState.messages;
  const synthesis =
    initialState.confirmedSnapshot?.synthesis ?? initialState.synthesis;
  const completed = initialState.status === "completed";
  const hasSynthesis = Boolean(synthesis);
  const canConfirm = Boolean(
    synthesis && initialState.progress.readyForConfirmation,
  );

  useEffect(() => {
    if (stage !== "basics" || basicContext.timezone !== "UTC") return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected) return;
    const frame = window.requestAnimationFrame(() => {
      setBasicContext((current) => ({ ...current, timezone: detected }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [basicContext.timezone, stage]);

  useEffect(() => {
    if (!basicState.completedAt || basicState.status !== "success") return;
    queueMicrotask(() => {
      setStage("conversation");
      router.refresh();
    });
  }, [basicState.completedAt, basicState.status, router]);

  useEffect(() => {
    if (!basicState.completedAt || basicState.status !== "error") return;
    const errorStep = basicState.fieldErrors?.preferredName?.length
      ? "name"
      : basicState.fieldErrors?.dateOfBirth?.length
        ? "birth"
        : null;
    if (!errorStep) return;
    queueMicrotask(() => setBasicStep(errorStep));
  }, [basicState.completedAt, basicState.fieldErrors, basicState.status]);

  useEffect(() => {
    if (!confirmState.completedAt || confirmState.status !== "success") return;
    router.refresh();
  }, [confirmState.completedAt, confirmState.status, router]);

  const scrollConversationToBottom = useCallback(() => {
    const scroll = conversationScrollRef.current;
    if (!scroll) return;
    scroll.scrollTop = clarityConversationBottom({
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
    });
    historyNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useLayoutEffect(() => {
    if (stage !== "conversation") return;
    if (!scrollAfterConversationChangeRef.current && messages.length > 0) {
      scrollConversationToBottom();
      return;
    }
    if (scrollAfterConversationChangeRef.current) {
      scrollAfterConversationChangeRef.current = false;
      scrollConversationToBottom();
    }
  }, [messages.length, hasSynthesis, scrollConversationToBottom, stage]);

  function submitBasicPreview(event: FormEvent<HTMLFormElement>) {
    if (!preview) return;
    event.preventDefault();
    setStage("conversation");
  }

  function continueFromName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preferredName = basicContext.preferredName.trim();
    if (!preferredName) {
      setBasicStepError("Tell me what to call you.");
      return;
    }
    if (preferredName.length > 200) {
      setBasicStepError("Keep your preferred name under 200 characters.");
      return;
    }
    setBasicContext((current) => ({ ...current, preferredName }));
    setBasicStepError(null);
    setBasicStep("birth");
  }

  function continueFromBirth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidBirthDate(basicContext.dateOfBirth)) {
      setBasicStepError("Choose a valid date of birth.");
      return;
    }
    setBasicStepError(null);
    setBasicStep("location");
  }

  function goToBasicStep(nextStep: BasicStep) {
    setBasicStepError(null);
    setBasicStep(nextStep);
  }

  const handlePreviewSend = useCallback((content: string) => {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    scrollAfterConversationChangeRef.current = true;
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
  }, []);

  const handleConversationChanged = useCallback(() => {
    scrollAfterConversationChangeRef.current = true;
    router.refresh();
  }, [router]);

  function handleConversationScroll() {
    const scroll = conversationScrollRef.current;
    if (!scroll) return;
    const nearBottom = isClarityHistoryNearBottom({
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      scrollTop: scroll.scrollTop,
    });
    historyNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }

  function openMessageImages(images: ClarityViewerImage[], imageId: string) {
    const index = images.findIndex((image) => image.id === imageId);
    if (index >= 0) setImageViewer({ images, index });
  }

  return (
    <main className="min-h-svh overflow-x-clip bg-background text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-[480px] flex-col border-x-0 border-border bg-background min-[481px]:border-x">
        <OnboardingHeader preview={preview} />

        {stage === "basics" ? (
          <section className="flex min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex min-h-full w-full flex-col">
              {basicStep === "welcome" && (
                <div
                  key="welcome"
                  className="clarity-greeting-enter flex flex-1 flex-col justify-center pb-[clamp(3rem,12svh,7rem)]"
                >
                  <div>
                    <p className="text-base font-medium text-primary">
                      Your life operating system.
                    </p>
                    <h1 className="mt-2 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.055em]">
                      Welcome to Clarity
                    </h1>
                    <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground">
                      Get clear on where you are, where you want to go, and what
                      to do next.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToBasicStep("name")}
                    className="mt-9 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground"
                  >
                    Start <ArrowRight className="size-4" />
                  </button>
                </div>
              )}

              {basicStep === "name" && (
                <form
                  key="name"
                  onSubmit={continueFromName}
                  className="clarity-greeting-enter flex flex-1 flex-col"
                >
                  <BasicStepHeader
                    step={1}
                    onBack={() => goToBasicStep("welcome")}
                  />
                  <div className="pt-[clamp(2rem,8svh,5rem)]">
                    <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.05em]">
                      What should I call you?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Just your first name is fine.
                    </p>
                    <Label htmlFor="onboarding-preferred-name" className="sr-only">
                      Preferred name
                    </Label>
                    <Input
                      id="onboarding-preferred-name"
                      value={basicContext.preferredName}
                      onChange={(event) => {
                        setBasicStepError(null);
                        setBasicContext((current) => ({
                          ...current,
                          preferredName: event.target.value,
                        }));
                      }}
                      autoComplete="given-name"
                      required
                      className={`${inputClassName} mt-6 text-base`}
                    />
                    {(basicStepError || basicState.fieldErrors?.preferredName?.[0]) && (
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {basicStepError ?? basicState.fieldErrors?.preferredName?.[0]}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground"
                  >
                    Next <ArrowRight className="size-4" />
                  </button>
                </form>
              )}

              {basicStep === "birth" && (
                <form
                  key="birth"
                  onSubmit={continueFromBirth}
                  className="clarity-greeting-enter flex flex-1 flex-col"
                >
                  <BasicStepHeader
                    step={2}
                    onBack={() => goToBasicStep("name")}
                  />
                  <div className="pt-[clamp(2rem,8svh,5rem)]">
                    <p className="mb-3 text-sm font-medium text-primary">
                      Nice to meet you, {basicContext.preferredName.trim()}.
                    </p>
                    <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.05em]">
                      When were you born?
                    </h1>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                      This helps me understand your stage of life and what options
                      make sense.
                    </p>
                    <Label htmlFor="onboarding-date-of-birth" className="sr-only">
                      Date of birth
                    </Label>
                    <Input
                      id="onboarding-date-of-birth"
                      type="date"
                      value={basicContext.dateOfBirth}
                      onChange={(event) => {
                        setBasicStepError(null);
                        setBasicContext((current) => ({
                          ...current,
                          dateOfBirth: event.target.value,
                        }));
                      }}
                      autoComplete="bday"
                      required
                      className={`${inputClassName} mt-6 min-w-0 w-full text-base`}
                    />
                    {(basicStepError || basicState.fieldErrors?.dateOfBirth?.[0]) && (
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {basicStepError ?? basicState.fieldErrors?.dateOfBirth?.[0]}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-medium text-primary-foreground"
                  >
                    Next <ArrowRight className="size-4" />
                  </button>
                </form>
              )}

              {basicStep === "location" && (
                <form
                  key="location"
                  action={preview ? undefined : basicAction}
                  onSubmit={submitBasicPreview}
                  className="clarity-greeting-enter flex flex-1 flex-col"
                >
                  <input
                    type="hidden"
                    name="preferredName"
                    value={basicContext.preferredName}
                  />
                  <input
                    type="hidden"
                    name="dateOfBirth"
                    value={basicContext.dateOfBirth}
                  />
                  <input
                    type="hidden"
                    name="timezone"
                    value={basicContext.timezone}
                  />
                  <BasicStepHeader
                    step={3}
                    onBack={() => goToBasicStep("birth")}
                  />
                  <div className="pt-[clamp(2rem,8svh,5rem)]">
                    <h1 className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.05em]">
                      Where are you based?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      This helps with context, opportunities, and timezone.
                    </p>
                    <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
                      <BasicField
                        id="onboarding-city"
                        label="City"
                        error={basicState.fieldErrors?.city?.[0]}
                      >
                        <Input
                          id="onboarding-city"
                          name="city"
                          value={basicContext.city}
                          onChange={(event) =>
                            setBasicContext((current) => ({
                              ...current,
                              city: event.target.value,
                            }))
                          }
                          autoComplete="address-level2"
                          required
                          className={inputClassName}
                        />
                      </BasicField>
                      <BasicField
                        id="onboarding-country"
                        label="Country"
                        error={basicState.fieldErrors?.country?.[0]}
                      >
                        <Input
                          id="onboarding-country"
                          name="country"
                          value={basicContext.country}
                          onChange={(event) =>
                            setBasicContext((current) => ({
                              ...current,
                              country: event.target.value,
                            }))
                          }
                          autoComplete="country-name"
                          required
                          className={inputClassName}
                        />
                      </BasicField>
                    </div>
                    {basicState.status === "error" && basicState.message && (
                      <p role="alert" className="mt-3 text-sm text-destructive">
                        {basicState.message}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto pt-8">
                    <PendingButton
                      pendingLabel="Saving…"
                      className="h-12 w-full rounded-xl text-base"
                    >
                      Continue <ArrowRight className="size-4" />
                    </PendingButton>
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
                      Timezone is set automatically.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </section>
        ) : (
          <>
            <section
              ref={conversationScrollRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 pb-5 pt-2 sm:px-6"
              aria-label="First Understanding conversation"
              onScroll={handleConversationScroll}
            >
              <h1 className="sr-only">First Understanding with Clarity</h1>
              <div className="space-y-3" aria-live="polite">
                <OnboardingOpeningMessage
                  preferredName={basicContext.preferredName}
                />
                {messages.map((message) => (
                  <OnboardingMessage
                    key={message.id}
                    message={message}
                    onOpenImages={openMessageImages}
                  />
                ))}
              </div>

              {synthesis && <OnboardingSynthesisView synthesis={synthesis} />}

              {!completed && canConfirm && initialState.sessionId && (
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

              <div aria-hidden="true" />
            </section>

            {!completed && (
              <OnboardingConversationComposer
                preview={preview}
                showJumpToLatest={showJumpToLatest}
                onJumpToLatest={scrollConversationToBottom}
                onConversationChanged={handleConversationChanged}
                onPreviewSend={handlePreviewSend}
              />
            )}
          </>
        )}
      </div>
      {imageViewer && (
        <ClarityImageViewer
          images={imageViewer.images}
          index={imageViewer.index}
          onIndexChange={(index) =>
            setImageViewer((current) =>
              current ? { ...current, index } : null,
            )
          }
          onClose={() => setImageViewer(null)}
        />
      )}
    </main>
  );
}

function OnboardingHeader({ preview }: { preview: boolean }) {
  return (
    <header className="shrink-0 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
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
    </header>
  );
}

function BasicStepHeader({
  step,
  onBack,
}: {
  step: 1 | 2 | 3;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Go back"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div
        className="flex items-center gap-1.5"
        role="progressbar"
        aria-label={`Step ${step} of 3`}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        {[1, 2, 3].map((position) => (
          <span
            key={position}
            className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
              position === step
                ? "w-5 bg-primary"
                : position < step
                  ? "w-1.5 bg-primary/45"
                  : "w-1.5 bg-muted-foreground/25"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="size-10" aria-hidden="true" />
    </div>
  );
}

function BasicField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function OnboardingOpeningMessage({ preferredName }: { preferredName: string }) {
  const name = preferredName.trim();
  return (
    <article className="mr-5 max-w-[94%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-6 text-foreground">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">Clarity</p>
      <div className="space-y-3">
        <p>Alright{name ? `, ${name}` : ""}. Give me the messy version.</p>
        <p>
          What’s going on in your life right now? What’s working, what feels
          messy, and what are you trying to figure out?
        </p>
        <p className="text-muted-foreground">
          You don’t need to organise it, just tell me straight.
        </p>
      </div>
    </article>
  );
}

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  return date.getTime() <= Date.now();
}

function OnboardingMessage({
  message,
  onOpenImages,
}: {
  message: OnboardingConversationMessage;
  onOpenImages: (images: ClarityViewerImage[], imageId: string) => void;
}) {
  const user = message.role === "user";
  const images = message.attachments
    .filter((item) => item.kind === "image" && item.signedUrl)
    .map((item) => ({
      id: item.id,
      src: item.signedUrl as string,
      alt: "Attached photo",
    }));
  return (
    <article
      className={
        user
          ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
          : "mr-5 max-w-[94%] rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-6 text-foreground"
      }
    >
      <p className="mb-1 text-xs font-semibold opacity-70">
        {user ? "You" : "Clarity"}
      </p>
      {images.length > 0 && (
        <div className="mb-2 grid min-w-0 grid-cols-2 gap-1.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className="min-w-0 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open attached photo ${index + 1}`}
              onClick={() => onOpenImages(images, image.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private signed user media has no stable Next Image host. */}
              <img
                src={image.src}
                alt={image.alt}
                className="max-h-64 w-full min-w-0 object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {message.content && <p>{message.content}</p>}
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
    ["What matters now", synthesis.whatMattersFirst],
    ["Current direction", synthesis.whatYouWant],
    ["What you have going for you", synthesis.whatYouHaveGoingForYou],
    ["What could get in the way", synthesis.whatCouldGetInTheWay],
    ["Still need to learn", synthesis.stillUnsure],
  ] as const;
  const horizons = [
    ["Short term · 30–90 days", synthesis.horizons.shortTerm],
    ["Mid term · 6 months–2 years", synthesis.horizons.midTerm],
    ["Long term · 3–5+ years", synthesis.horizons.longTerm],
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
    attachments: [],
  };
}
