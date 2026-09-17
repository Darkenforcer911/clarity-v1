"use client";

import {
  ArrowDown,
  Camera,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react";
import { useRouter } from "next/navigation";

import {
  discardClarityAttachmentAction,
  prepareClarityAttachmentAction,
  retryClarityResearchAction,
  sendClarityMessageAction,
  transcribeClarityDictationAction,
} from "@/app/(app)/clarity/actions";
import { Button } from "@/components/ui/button";
import {
  useAppShellConversationRoute,
  useAppShellEditorState,
} from "@/components/clarity/app-shell-editor-context";
import {
  ClarityImageViewer,
  type ClarityViewerImage,
} from "@/components/clarity/clarity-image-viewer";
import { ClarityMemoryProposalCard } from "@/components/clarity/clarity-memory-proposal-card";
import { initialClarityConversationActionState } from "@/lib/clarity/ai/clarity-conversation-action-state";
import {
  appendDictationTranscript,
  type ClarityDictationStatus,
} from "@/lib/clarity/ai/clarity-dictation";
import type { ClarityConversationMessage } from "@/lib/clarity/ai/clarity-conversation-service";
import type { ClarityInvocationDescriptor } from "@/lib/clarity/ai/clarity-context-assembler";
import {
  CLARITY_MEDIA_BUCKET,
  MAX_CLARITY_AUDIO_BYTES,
  MAX_CLARITY_AUDIO_DURATION_MS,
  MAX_CLARITY_IMAGE_BYTES,
  MAX_CLARITY_IMAGE_COUNT,
  clarityImageMimeTypes,
  normalizeClarityMimeType,
  type ClarityMessageAttachment,
} from "@/lib/clarity/ai/clarity-attachments";
import {
  CLARITY_COMPOSER_MAX_HEIGHT_PX,
  clarityComposerHeight,
  preventClarityComposerTouchDefault,
  resolveClarityComposerTouch,
} from "@/lib/clarity/ai/clarity-composer";
import {
  clarityComposerKeyboardBottomOffset,
  clarityConversationBottom,
  clarityHistoryBottomInset,
  isClarityHistoryNearBottom,
  type ClarityHistoryGeometry,
  isClarityKeyboardOpen,
  resolveClarityInitialHistoryMeasurement,
  resolveClarityKeyboardDismissalDelay,
  resolveClarityKeyboardPhase,
} from "@/lib/clarity/ai/clarity-chat-layout";
import {
  preventClarityHistoryGestureDefault,
  resolveClarityHistoryGesture,
} from "@/lib/clarity/ai/clarity-history-gesture";
import { normalizeClarityImageFile } from "@/lib/clarity/ai/clarity-image-normalization";
import { normalizeClarityVisibleResponse } from "@/lib/clarity/ai/clarity-response-presentation";
import {
  researchSourcesFromMetadata,
  researchPublisherLabel,
  type ClarityResearchSource,
} from "@/lib/clarity/ai/clarity-research";
import { createClient } from "@/lib/supabase/client";
import { PendingButton } from "./pending-button";

type ComposerAttachment = {
  invocation: ClarityInvocationDescriptor;
  label: string;
};

type DraftMedia = {
  attachmentId: string;
  storagePath: string;
  kind: "image" | "audio";
  mimeType: string;
  previewUrl: string;
  durationMs: number | null;
};

type PendingDictation = {
  file: File;
  durationMs: number;
  attachmentId: string | null;
};

type ConversationKeyboardLayout = {
  bottomOffset: number | null;
  phase: "closed" | "open" | "closing";
};

type ImageViewerState = {
  images: ClarityViewerImage[];
  index: number;
};

const GENERAL_INVOCATION: ClarityInvocationDescriptor = {
  type: "general",
  actionId: null,
  calendarCommitmentId: null,
  localDate: null,
};

export function ClarityConversation({
  messages,
  invocation,
  subjectLabel,
}: {
  messages: ClarityConversationMessage[];
  invocation: ClarityInvocationDescriptor;
  subjectLabel: string | null;
}) {
  useAppShellConversationRoute();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    sendClarityMessageAction,
    initialClarityConversationActionState,
  );
  const lastCompletedAt = useRef<number | undefined>(undefined);
  const incomingAttachmentKey = attachmentKey(invocation, subjectLabel);
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(() =>
    createAttachment(invocation, subjectLabel),
  );
  const previousIncomingAttachmentKey = useRef(incomingAttachmentKey);
  const [message, setMessage] = useState("");
  const [draftMedia, setDraftMedia] = useState<DraftMedia[]>([]);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const dictationDraftPositionPendingRef = useRef(false);
  const activeRecordingStartedAtRef = useRef(0);
  const recordedDurationMsRef = useRef(0);
  const cancelRecordingRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dictationStatus, setDictationStatus] =
    useState<ClarityDictationStatus>("idle");
  const [pendingDictation, setPendingDictation] =
    useState<PendingDictation | null>(null);
  const [canPauseRecording, setCanPauseRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerTouchRef = useRef<{
    identifier: number;
    origin: "textarea" | "composer";
    startX: number;
    startY: number;
    lastY: number;
    keyboardOpenAtStart: boolean;
    containmentActive: boolean;
    blurRequested: boolean;
  } | null>(null);
  const historyTouchRef = useRef<{
    identifier: number;
    startX: number;
    startY: number;
    keyboardOpenAtStart: boolean;
    textareaFocusedAtStart: boolean;
    containmentActive: boolean;
    blurRequested: boolean;
  } | null>(null);
  const conversationHostRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const conversationContentRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const historyBottomInsetRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const viewerScrollTopRef = useRef<number | null>(null);
  const messagesLengthRef = useRef(messages.length);
  messagesLengthRef.current = messages.length;
  const initialPositionedRef = useRef(messages.length === 0);
  const initialPositionFrameRef = useRef<number | null>(null);
  const initialHistoryObserverRef = useRef<ResizeObserver | null>(null);
  const initialHistoryGeometryRef = useRef<ClarityHistoryGeometry | null>(null);
  const initialHistoryObserverDeliveredRef = useRef(false);
  const scheduleInitialHistoryMeasurementRef = useRef<(() => void) | null>(
    null,
  );
  const historyNearBottomRef = useRef(true);
  const scrollAfterSendMessageCountRef = useRef<number | null>(null);
  const baselineViewportHeightRef = useRef(0);
  const keyboardWasOpenRef = useRef(false);
  const keyboardDismissalPendingRef = useRef(false);
  const keyboardDismissalFramesRef = useRef<number[]>([]);
  const keyboardDismissalSettleTimerRef = useRef<number | null>(null);
  const keyboardDismissalStartedAtRef = useRef<number | null>(null);
  const documentBaselineNormalizedRef = useRef(false);
  const preComposerDocumentScrollRef = useRef<{
    left: number;
    top: number;
  } | null>(null);
  const documentScrollRestoredRef = useRef(false);
  const composerEditorActiveRef = useRef(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [initialHistoryReady, setInitialHistoryReady] = useState(
    messages.length === 0,
  );
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [keyboardLayout, setKeyboardLayout] =
    useState<ConversationKeyboardLayout>({
      bottomOffset: null,
      phase: "closed",
    });
  const nonKeyboardComposerActive =
    addMenuOpen ||
    mediaBusy ||
    !["idle", "transcript_ready"].includes(dictationStatus);
  const composerEditorActive = composerFocused || nonKeyboardComposerActive;
  // Form focus controls editing; measured viewport geometry owns keyboard layout.
  const mobileComposerActive =
    mobileViewport &&
      (nonKeyboardComposerActive ||
      (keyboardLayout.phase !== "closing" &&
        (composerFocused || keyboardLayout.phase === "open")));
  useAppShellEditorState(mobileComposerActive);

  useLayoutEffect(() => {
    composerEditorActiveRef.current = composerEditorActive;
  }, [composerEditorActive]);

  useLayoutEffect(() => {
    // Next cacheComponents retains this route in an Activity boundary. React
    // preserves refs/state while hidden, but the native scroll node returns to
    // zero. Reconnect entry-only positioning on every route activation.
    const empty = messagesLengthRef.current === 0;
    initialPositionedRef.current = empty;
    initialHistoryGeometryRef.current = null;
    initialHistoryObserverDeliveredRef.current = false;
    historyNearBottomRef.current = true;
    setInitialHistoryReady(empty);
    setShowJumpToLatest(false);

    return () => {
      initialHistoryObserverRef.current?.disconnect();
      initialHistoryObserverRef.current = null;
      scheduleInitialHistoryMeasurementRef.current = null;
      if (initialPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(initialPositionFrameRef.current);
        initialPositionFrameRef.current = null;
      }
    };
  }, []);

  const scrollConversationToBottom = useCallback(() => {
    const scroll = conversationScrollRef.current;
    const end = conversationEndRef.current;
    if (!scroll || !end?.isConnected) return null;
    const expectedBottom = clarityConversationBottom({
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
    });
    scroll.scrollTop = expectedBottom;
    historyNearBottomRef.current = true;
    setShowJumpToLatest(false);
    return {
      expectedBottom,
      positionedAtBottom: Math.abs(scroll.scrollTop - expectedBottom) < 1,
    };
  }, []);

  const syncHistoryBottomInset = useCallback(() => {
    const history = conversationScrollRef.current;
    const inset = historyBottomInsetRef.current;
    const composerDock = composerDockRef.current;
    if (!history || !inset || !composerDock) return;

    const keepLatestVisible =
      initialPositionedRef.current && historyNearBottomRef.current;
    const nextInset = clarityHistoryBottomInset({
      composerDockTop: composerDock.getBoundingClientRect().top,
      historyBottom: history.getBoundingClientRect().bottom,
    });
    const nextHeight = `${nextInset}px`;
    if (inset.style.height !== nextHeight) {
      inset.style.height = nextHeight;
      scheduleInitialHistoryMeasurementRef.current?.();
    }
    // A visual/layout viewport resize can change the history's legal bottom
    // without changing the dock overlap itself. Reconcile that synchronously
    // while the user's prior position still says to keep latest visible.
    if (keepLatestVisible) {
      history.scrollTop = clarityConversationBottom({
        clientHeight: history.clientHeight,
        scrollHeight: history.scrollHeight,
      });
    }
    if (initialPositionedRef.current) {
      const nearBottom = isClarityHistoryNearBottom({
        clientHeight: history.clientHeight,
        scrollHeight: history.scrollHeight,
        scrollTop: history.scrollTop,
      });
      historyNearBottomRef.current = nearBottom;
      setShowJumpToLatest(!nearBottom);
    }
  }, []);

  const cancelKeyboardDismissal = useCallback(() => {
    if (keyboardDismissalSettleTimerRef.current !== null) {
      window.clearTimeout(keyboardDismissalSettleTimerRef.current);
      keyboardDismissalSettleTimerRef.current = null;
    }
    keyboardDismissalFramesRef.current.forEach((frame) =>
      window.cancelAnimationFrame(frame),
    );
    keyboardDismissalFramesRef.current = [];
    keyboardDismissalPendingRef.current = false;
    keyboardDismissalStartedAtRef.current = null;
  }, []);

  const beginKeyboardDismissal = useCallback(() => {
    if (keyboardDismissalSettleTimerRef.current !== null) {
      window.clearTimeout(keyboardDismissalSettleTimerRef.current);
    }
    keyboardDismissalFramesRef.current.forEach((frame) =>
      window.cancelAnimationFrame(frame),
    );
    keyboardDismissalFramesRef.current = [];
    keyboardDismissalPendingRef.current = true;
    const observedAt = window.performance.now();
    keyboardDismissalStartedAtRef.current ??= observedAt;
    setKeyboardLayout((current) =>
      current.phase === "closing" && current.bottomOffset === null
        ? current
        : { bottomOffset: null, phase: "closing" },
    );

    const scheduleFrame = (callback: () => void) => {
      const frame = window.requestAnimationFrame(() => {
        keyboardDismissalFramesRef.current =
          keyboardDismissalFramesRef.current.filter((item) => item !== frame);
        callback();
      });
      keyboardDismissalFramesRef.current.push(frame);
    };
    const viewportStillShowsKeyboard = () => {
      const visualViewport = window.visualViewport;
      return isClarityKeyboardOpen({
        baselineHeight: baselineViewportHeightRef.current,
        visibleHeight: visualViewport?.height ?? window.innerHeight,
        visibleOffsetTop: visualViewport?.offsetTop ?? 0,
        previouslyOpen: true,
      });
    };
    const abandonDismissal = () => {
      keyboardDismissalPendingRef.current = false;
      keyboardDismissalStartedAtRef.current = null;
    };

    const visualViewport = window.visualViewport;
    const settleDelay = resolveClarityKeyboardDismissalDelay({
      dismissalStartedAt: keyboardDismissalStartedAtRef.current,
      observedAt,
      baselineHeight: baselineViewportHeightRef.current,
      visibleHeight: visualViewport?.height ?? window.innerHeight,
      visibleOffsetTop: visualViewport?.offsetTop ?? 0,
    });

    keyboardDismissalSettleTimerRef.current = window.setTimeout(() => {
      keyboardDismissalSettleTimerRef.current = null;

      // Require two closed-viewport frames after WebKit's resize pulses settle.
      scheduleFrame(() => {
        if (viewportStillShowsKeyboard()) {
          abandonDismissal();
          return;
        }
        scheduleFrame(() => {
          if (viewportStillShowsKeyboard()) {
            abandonDismissal();
            return;
          }

          const savedScroll = preComposerDocumentScrollRef.current;
          if (savedScroll && !documentScrollRestoredRef.current) {
            // iOS may scroll the document to focus a fixed composer. Undo it once.
            documentScrollRestoredRef.current = true;
            if (
              Math.abs(window.scrollX - savedScroll.left) >= 1 ||
              Math.abs(window.scrollY - savedScroll.top) >= 1
            ) {
              window.scrollTo(savedScroll.left, savedScroll.top);
            }
          }

          scheduleFrame(() => {
            scheduleFrame(() => {
              if (viewportStillShowsKeyboard()) {
                abandonDismissal();
                return;
              }
              setKeyboardLayout({ bottomOffset: null, phase: "closed" });
              keyboardWasOpenRef.current = false;
              keyboardDismissalPendingRef.current = false;
              keyboardDismissalStartedAtRef.current = null;
              preComposerDocumentScrollRef.current = null;
              if (document.activeElement === composerTextareaRef.current) {
                composerTextareaRef.current?.blur();
              }
            });
          });
        });
      });
    }, settleDelay);
  }, []);

  const updateConversationViewport = useCallback(() => {
    if (!conversationHostRef.current || !mobileViewport) return;
    // Viewport events run before paint. Give the fixed dock and its history
    // reservation one synchronous reconciliation; ResizeObserver remains the
    // fallback for content-driven dock size changes.
    syncHistoryBottomInset();
    const visualViewport = window.visualViewport;
    const visibleHeight = visualViewport?.height ?? window.innerHeight;
    const visibleOffsetTop = visualViewport?.offsetTop ?? 0;
    if (baselineViewportHeightRef.current === 0) {
      baselineViewportHeightRef.current = Math.max(
        visibleHeight,
        window.innerHeight,
      );
    }
    const keyboardPhase = resolveClarityKeyboardPhase({
      baselineHeight: baselineViewportHeightRef.current,
      visibleHeight,
      visibleOffsetTop,
      previouslyOpen: keyboardWasOpenRef.current,
      dismissalPending: keyboardDismissalPendingRef.current,
    });
    if (keyboardPhase === "closing") {
      beginKeyboardDismissal();
      return;
    }
    const keyboardOpen = keyboardPhase === "open";
    if (keyboardOpen && keyboardDismissalPendingRef.current) {
      cancelKeyboardDismissal();
    }
    if (!keyboardOpen) {
      if (!composerEditorActive) {
        baselineViewportHeightRef.current = Math.max(
          visibleHeight,
          window.innerHeight,
        );
      }
      keyboardWasOpenRef.current = false;
      setKeyboardLayout((current) =>
        current.phase === "closed" && current.bottomOffset === null
          ? current
          : { bottomOffset: null, phase: "closed" },
      );
      return;
    }

    const bottomOffset = clarityComposerKeyboardBottomOffset({
      // CSS fixed positioning resolves against the current layout viewport.
      // The resting baseline is only for keyboard classification.
      layoutViewportHeight: window.innerHeight,
      visibleHeight,
      visibleOffsetTop,
    });
    setKeyboardLayout((current) =>
      current.phase === "open" && current.bottomOffset === bottomOffset
        ? current
        : { bottomOffset, phase: "open" },
    );
    keyboardWasOpenRef.current = true;
  }, [
    beginKeyboardDismissal,
    cancelKeyboardDismissal,
    composerEditorActive,
    mobileViewport,
    syncHistoryBottomInset,
  ]);

  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setMobileViewport(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const history = conversationScrollRef.current;
    const composerDock = composerDockRef.current;
    if (!history || !composerDock) return;

    const observer = new ResizeObserver(syncHistoryBottomInset);
    observer.observe(history);
    observer.observe(composerDock);
    syncHistoryBottomInset();
    return () => observer.disconnect();
  }, [syncHistoryBottomInset]);

  useLayoutEffect(() => {
    syncHistoryBottomInset();
  }, [keyboardLayout.bottomOffset, mobileViewport, syncHistoryBottomInset]);

  useLayoutEffect(() => {
    if (!mobileViewport) return;
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
    };

    if (!documentBaselineNormalizedRef.current) {
      documentBaselineNormalizedRef.current = true;
      if (Math.abs(window.scrollX) >= 1 || Math.abs(window.scrollY) >= 1) {
        // Clarity's history is the mobile scroll owner; page scroll is stale iOS state.
        window.scrollTo(0, 0);
      }
    }

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
    };
  }, [mobileViewport]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => updateConversationViewport();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [updateConversationViewport]);

  useLayoutEffect(() => {
    if (!mobileViewport) return;
    updateConversationViewport();
  }, [mobileViewport, updateConversationViewport]);

  useLayoutEffect(() => {
    const textarea = composerTextareaRef.current;
    resizeComposerTextarea(textarea);
    if (!textarea || !dictationDraftPositionPendingRef.current) return;

    dictationDraftPositionPendingRef.current = false;
    const end = textarea.value.length;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(end, end);
    textarea.scrollTop = textarea.scrollHeight;
  }, [message, attachment, dictationStatus]);

  useEffect(() => {
    const composer = composerFormRef.current;
    const textarea = composerTextareaRef.current;
    if (!composer || !textarea) return;

    const findTouch = (touches: TouchList, identifier: number) =>
      Array.from(touches).find((point) => point.identifier === identifier);
    const resetTouch = () => {
      composerTouchRef.current = null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = composerTouchRef.current;
      if (!touch) return;

      const point = findTouch(event.touches, touch.identifier);
      if (event.touches.length !== 1 || !point) {
        resetTouch();
        return;
      }
      const decision = resolveClarityComposerTouch({
        ...touch,
        currentX: point.clientX,
        currentY: point.clientY,
        scrollTop: textarea.scrollTop,
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
        eventTargetsTextarea: event.composedPath().includes(textarea),
      });
      const containmentActive = touch.containmentActive || decision.contain;
      const blurRequested =
        touch.blurRequested ||
        (touch.keyboardOpenAtStart &&
          containmentActive &&
          document.activeElement === textarea);
      composerTouchRef.current = {
        ...touch,
        lastY: point.clientY,
        containmentActive,
        blurRequested,
      };

      preventClarityComposerTouchDefault(
        event,
        containmentActive,
      );
      if (blurRequested && !touch.blurRequested) textarea.blur();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const touch = composerTouchRef.current;
      if (touch && findTouch(event.changedTouches, touch.identifier)) {
        resetTouch();
      }
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const startsInTextarea = event.composedPath().includes(textarea);
      const composerOwnsShellGesture =
        composer.contains(document.activeElement) ||
        keyboardWasOpenRef.current ||
        composerEditorActiveRef.current;
      if (!startsInTextarea && !composerOwnsShellGesture) return;

      resetTouch();
      const point = event.touches[0];
      composerTouchRef.current = {
        identifier: point.identifier,
        origin: startsInTextarea ? "textarea" : "composer",
        startX: point.clientX,
        startY: point.clientY,
        lastY: point.clientY,
        keyboardOpenAtStart: keyboardWasOpenRef.current,
        containmentActive: false,
        blurRequested: false,
      };
    };

    composer.addEventListener("touchstart", handleTouchStart, {
      passive: true,
      capture: true,
    });
    composer.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    composer.addEventListener("touchend", handleTouchEnd, {
      passive: true,
      capture: true,
    });
    composer.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
      capture: true,
    });

    return () => {
      composer.removeEventListener("touchstart", handleTouchStart, true);
      composer.removeEventListener("touchmove", handleTouchMove, true);
      composer.removeEventListener("touchend", handleTouchEnd, true);
      composer.removeEventListener("touchcancel", handleTouchEnd, true);
      resetTouch();
    };
  }, [dictationStatus]);

  useEffect(() => {
    const history = conversationScrollRef.current;
    const textarea = composerTextareaRef.current;
    if (!history || !textarea) return;

    const findTouch = (touches: TouchList, identifier: number) =>
      Array.from(touches).find((point) => point.identifier === identifier);
    const resetHistoryTouch = () => {
      historyTouchRef.current = null;
    };
    const handleHistoryTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const point = event.touches[0];
      const textareaFocusedAtStart = document.activeElement === textarea;
      historyTouchRef.current = {
        identifier: point.identifier,
        startX: point.clientX,
        startY: point.clientY,
        keyboardOpenAtStart: keyboardWasOpenRef.current,
        textareaFocusedAtStart,
        containmentActive: false,
        blurRequested: false,
      };
    };
    const handleHistoryTouchMove = (event: TouchEvent) => {
      const touch = historyTouchRef.current;
      if (!touch) return;
      const point = findTouch(event.touches, touch.identifier);
      if (event.touches.length !== 1 || !point) {
        resetHistoryTouch();
        return;
      }

      const decision = resolveClarityHistoryGesture({
        keyboardOpenAtStart: touch.keyboardOpenAtStart,
        textareaFocusedAtStart: touch.textareaFocusedAtStart,
        startX: touch.startX,
        startY: touch.startY,
        currentX: point.clientX,
        currentY: point.clientY,
      });
      const containmentActive = touch.containmentActive || decision.contain;
      preventClarityHistoryGestureDefault(
        event,
        containmentActive,
      );
      const blurRequested =
        touch.blurRequested ||
        (decision.blurTextarea && document.activeElement === textarea);
      if (blurRequested && !touch.blurRequested) textarea.blur();
      historyTouchRef.current = {
        ...touch,
        containmentActive,
        blurRequested,
      };
    };
    const handleHistoryTouchEnd = (event: TouchEvent) => {
      const touch = historyTouchRef.current;
      if (!touch || !findTouch(event.changedTouches, touch.identifier)) return;
      resetHistoryTouch();
    };

    history.addEventListener("touchstart", handleHistoryTouchStart, {
      passive: true,
      capture: true,
    });
    history.addEventListener("touchmove", handleHistoryTouchMove, {
      passive: false,
      capture: true,
    });
    history.addEventListener("touchend", handleHistoryTouchEnd, {
      passive: true,
      capture: true,
    });
    history.addEventListener("touchcancel", handleHistoryTouchEnd, {
      passive: true,
      capture: true,
    });

    return () => {
      history.removeEventListener("touchstart", handleHistoryTouchStart, true);
      history.removeEventListener("touchmove", handleHistoryTouchMove, true);
      history.removeEventListener("touchend", handleHistoryTouchEnd, true);
      history.removeEventListener("touchcancel", handleHistoryTouchEnd, true);
      resetHistoryTouch();
    };
  }, [dictationStatus]);

  useLayoutEffect(() => {
    if (initialPositionedRef.current) return;
    if (messages.length === 0) {
      return;
    }

    const history = conversationScrollRef.current;
    const content = conversationContentRef.current;
    if (!history || !content) return;
    let disposed = false;

    const disconnect = () => {
      initialHistoryObserverRef.current?.disconnect();
      initialHistoryObserverRef.current = null;
      scheduleInitialHistoryMeasurementRef.current = null;
      if (initialPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(initialPositionFrameRef.current);
        initialPositionFrameRef.current = null;
      }
    };
    const measure = () => {
      initialPositionFrameRef.current = null;
      if (disposed || initialPositionedRef.current) return;
      syncHistoryBottomInset();

      const current: ClarityHistoryGeometry = {
        clientHeight: history.clientHeight,
        contentHeight: content.getBoundingClientRect().height,
        scrollHeight: history.scrollHeight,
      };
      const expectedBottom = clarityConversationBottom(current);
      history.scrollTop = expectedBottom;
      const measurement = resolveClarityInitialHistoryMeasurement({
        actualScrollTop: history.scrollTop,
        current,
        observerDelivered: initialHistoryObserverDeliveredRef.current,
        previous: initialHistoryGeometryRef.current,
      });
      initialHistoryGeometryRef.current = current;
      if (measurement.ready) {
        initialPositionedRef.current = true;
        historyNearBottomRef.current = true;
        disconnect();
        setInitialHistoryReady(true);
        return;
      }
      scheduleMeasurement();
    };
    const scheduleMeasurement = () => {
      if (
        disposed ||
        initialPositionedRef.current ||
        initialPositionFrameRef.current !== null
      ) {
        return;
      }
      initialPositionFrameRef.current = window.requestAnimationFrame(measure);
    };

    scheduleInitialHistoryMeasurementRef.current = scheduleMeasurement;
    const observer = new ResizeObserver(() => {
      initialHistoryObserverDeliveredRef.current = true;
      scheduleMeasurement();
    });
    initialHistoryObserverRef.current = observer;
    observer.observe(history);
    observer.observe(content);
    measure();

    return () => {
      disposed = true;
      disconnect();
    };
  }, [messages.length, syncHistoryBottomInset]);

  useLayoutEffect(() => {
    if (!initialPositionedRef.current) return;
    const sentFromCount = scrollAfterSendMessageCountRef.current;
    if (sentFromCount !== null && messages.length > sentFromCount) {
      scrollAfterSendMessageCountRef.current = null;
      scrollConversationToBottom();
    }
  }, [messages, scrollConversationToBottom]);

  useEffect(() => {
    if (incomingAttachmentKey === previousIncomingAttachmentKey.current) return;
    previousIncomingAttachmentKey.current = incomingAttachmentKey;
    setAttachment(createAttachment(invocation, subjectLabel));
  }, [incomingAttachmentKey, invocation, subjectLabel]);

  useEffect(() => {
    if (!state.completedAt || state.completedAt === lastCompletedAt.current) return;
    lastCompletedAt.current = state.completedAt;
    if (state.success || state.retryMessageId) {
      queueMicrotask(() => {
        setMessage("");
        setDraftMedia((current) => {
          current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
          return [];
        });
      });
    }
    if (state.success && attachment) {
      router.replace("/clarity", { scroll: false });
      return;
    }
    router.refresh();
  }, [attachment, router, state.completedAt, state.retryMessageId, state.success]);

  useEffect(() => () => {
    cancelKeyboardDismissal();
    stopRecorderTracks();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }, [cancelKeyboardDismissal]);

  function removeAttachment() {
    setAttachment(null);
    router.replace("/clarity", { scroll: false });
  }

  async function addImages(files: File[]) {
    setAddMenuOpen(false);
    setMediaError(null);
    const available = MAX_CLARITY_IMAGE_COUNT - draftMedia.length;
    const selected = files.slice(0, Math.max(0, available));
    if (selected.length === 0) {
      setMediaError(`You can attach up to ${MAX_CLARITY_IMAGE_COUNT} photos.`);
      return;
    }

    setMediaBusy(true);
    try {
      for (const selectedFile of selected) {
        const file = await normalizeClarityImageFile(selectedFile);
        const mimeType = normalizeClarityMimeType(file.type);
        if (!clarityImageMimeTypes.includes(mimeType as never)) {
          throw new Error("Choose a JPEG, PNG, WebP, or GIF image.");
        }
        if (file.size < 1 || file.size > MAX_CLARITY_IMAGE_BYTES) {
          throw new Error("Images must be 15 MB or smaller.");
        }
        const uploaded = await uploadDraft(file, "image", null);
        setDraftMedia((current) => [...current, uploaded]);
      }
      if (files.length > selected.length) {
        setMediaError(`You can attach up to ${MAX_CLARITY_IMAGE_COUNT} photos.`);
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : "That photo couldn’t be added.",
      );
    } finally {
      setMediaBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (libraryInputRef.current) libraryInputRef.current.value = "";
    }
  }

  async function removeDraft(item: DraftMedia) {
    setDraftMedia((current) =>
      current.filter((candidate) => candidate.attachmentId !== item.attachmentId),
    );
    URL.revokeObjectURL(item.previewUrl);
    try {
      await discardClarityAttachmentAction({
        attachmentId: item.attachmentId,
      });
    } catch {
      setMediaError("That attachment couldn’t be removed. Try again.");
    }
  }

  async function startRecording() {
    setMediaError(null);
    setAddMenuOpen(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("Dictation isn’t available on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      cancelRecordingRef.current = false;
      activeRecordingStartedAtRef.current = Date.now();
      recordedDurationMsRef.current = 0;
      setRecordingElapsedMs(0);
      setPendingDictation(null);
      setCanPauseRecording(
        typeof recorder.pause === "function" &&
          typeof recorder.resume === "function",
      );
      setDictationStatus("recording");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => void finishRecordedBlob(recorder.mimeType);
      recorder.start(500);
      recordingTimerRef.current = setInterval(() => {
        const elapsed =
          recordedDurationMsRef.current +
          (recorder.state === "recording"
            ? Date.now() - activeRecordingStartedAtRef.current
            : 0);
        setRecordingElapsedMs(elapsed);
        if (elapsed >= MAX_CLARITY_AUDIO_DURATION_MS) stopDictation();
      }, 250);
    } catch {
      stopRecorderTracks();
      setDictationStatus("idle");
      setMediaError("Clarity couldn’t access the microphone.");
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording" || !canPauseRecording) return;
    recordedDurationMsRef.current +=
      Date.now() - activeRecordingStartedAtRef.current;
    setRecordingElapsedMs(recordedDurationMsRef.current);
    recorder.requestData();
    recorder.pause();
    setDictationStatus("paused");
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused" || !canPauseRecording) return;
    activeRecordingStartedAtRef.current = Date.now();
    recorder.resume();
    setDictationStatus("recording");
  }

  function stopDictation() {
    const recorder = recorderRef.current;
    if (!recorder || !["recording", "paused"].includes(recorder.state)) return;
    if (recorder.state === "recording") {
      recordedDurationMsRef.current +=
        Date.now() - activeRecordingStartedAtRef.current;
    }
    setRecordingElapsedMs(recordedDurationMsRef.current);
    clearRecordingTimer();
    setDictationStatus("transcribing");
    recorder.stop();
  }

  function cancelRecording() {
    cancelRecordingRef.current = true;
    clearRecordingTimer();
    if (
      recorderRef.current &&
      ["recording", "paused"].includes(recorderRef.current.state)
    ) {
      recorderRef.current.stop();
    } else {
      stopRecorderTracks();
    }
    setDictationStatus("idle");
    setRecordingElapsedMs(0);
  }

  async function finishRecordedBlob(recorderMimeType: string) {
    clearRecordingTimer();
    const cancelled = cancelRecordingRef.current;
    const elapsed = Math.min(
      MAX_CLARITY_AUDIO_DURATION_MS,
      Math.max(1, recordedDurationMsRef.current),
    );
    const chunks = recorderChunksRef.current;
    stopRecorderTracks();
    setRecordingElapsedMs(0);
    if (cancelled) {
      setDictationStatus("idle");
      return;
    }

    const mimeType = normalizeClarityMimeType(
      recorderMimeType || chunks[0]?.type || "audio/webm",
    );
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < 1 || blob.size > MAX_CLARITY_AUDIO_BYTES) {
      setDictationStatus("idle");
      setMediaError("That dictation couldn’t be processed.");
      return;
    }

    const dictation = {
      file: new File([blob], audioFileName(mimeType), { type: mimeType }),
      durationMs: elapsed,
      attachmentId: null,
    };
    setPendingDictation(dictation);
    await transcribeDictation(dictation);
  }

  async function transcribeDictation(dictation: PendingDictation) {
    setDictationStatus("transcribing");
    setMediaError(null);
    let attachmentId = dictation.attachmentId;
    try {
      if (!attachmentId) {
        const uploaded = await uploadDraft(
          dictation.file,
          "audio",
          dictation.durationMs,
        );
        attachmentId = uploaded.attachmentId;
        setPendingDictation({ ...dictation, attachmentId });
        URL.revokeObjectURL(uploaded.previewUrl);
      }
      const result = await transcribeClarityDictationAction({ attachmentId });
      if (!result.transcript) {
        throw new Error(result.error ?? "Transcription failed.");
      }
      dictationDraftPositionPendingRef.current = true;
      setMessage((current) =>
        appendDictationTranscript(current, result.transcript),
      );
      setPendingDictation(null);
      setDictationStatus("transcript_ready");
    } catch {
      setDictationStatus("failed");
      setMediaError(null);
    }
  }

  async function cancelPendingDictation() {
    const attachmentId = pendingDictation?.attachmentId;
    setPendingDictation(null);
    setDictationStatus("idle");
    setMediaError(null);
    if (!attachmentId) return;
    try {
      await discardClarityAttachmentAction({ attachmentId });
    } catch {
      setMediaError("That dictation couldn’t be removed. Try again.");
    }
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      isPending ||
      mediaBusy ||
      ["recording", "paused", "transcribing", "failed"].includes(
        dictationStatus,
      )
    ) return;
    if (!message.trim() && draftMedia.length === 0) {
      setMediaError("Write a message or add something first.");
      return;
    }
    setMediaError(null);
    const formData = new FormData(event.currentTarget);
    draftMedia.forEach((item) =>
      formData.append("attachmentId", item.attachmentId),
    );
    scrollAfterSendMessageCountRef.current = messages.length;
    startTransition(() => formAction(formData));
  }

  const canSend = Boolean(message.trim() || draftMedia.length > 0);

  function handleHistoryScroll() {
    const history = conversationScrollRef.current;
    if (!history || !initialPositionedRef.current) return;
    const nearBottom = isClarityHistoryNearBottom({
      clientHeight: history.clientHeight,
      scrollHeight: history.scrollHeight,
      scrollTop: history.scrollTop,
    });
    historyNearBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }

  function jumpToLatest() {
    scrollConversationToBottom();
  }

  function handleComposerFocus(event: ReactFocusEvent) {
    if (
      event.target instanceof HTMLTextAreaElement &&
      event.target === composerTextareaRef.current &&
      !keyboardWasOpenRef.current
    ) {
      preComposerDocumentScrollRef.current = {
        left: 0,
        top: 0,
      };
      documentScrollRestoredRef.current = false;
    }
    setComposerFocused(true);
    window.requestAnimationFrame(updateConversationViewport);
  }

  function handleComposerBlur() {
    window.setTimeout(() => {
      if (composerFormRef.current?.contains(document.activeElement)) return;
      setComposerFocused(false);
    }, 0);
  }

  function openImageViewer(images: ClarityViewerImage[], imageId: string) {
    const index = images.findIndex((image) => image.id === imageId);
    if (index < 0) return;
    viewerScrollTopRef.current = conversationScrollRef.current?.scrollTop ?? null;
    composerTextareaRef.current?.blur();
    setComposerFocused(false);
    setImageViewer({ images, index });
  }

  function closeImageViewer() {
    setImageViewer(null);
    const scrollTop = viewerScrollTopRef.current;
    viewerScrollTopRef.current = null;
    if (scrollTop === null) return;
    window.requestAnimationFrame(() => {
      if (conversationScrollRef.current) {
        conversationScrollRef.current.scrollTop = scrollTop;
      }
    });
  }

  const composerDockStyle = {
    bottom:
      keyboardLayout.bottomOffset === null
        ? "var(--clarity-app-bottom-boundary)"
        : `${keyboardLayout.bottomOffset}px`,
    left: "max(calc(1rem + env(safe-area-inset-left)), calc((100vw - 480px) / 2 + 1rem))",
    right: "max(calc(1rem + env(safe-area-inset-right)), calc((100vw - 480px) / 2 + 1rem))",
  };
  const draftViewerImages = draftMedia
    .filter((item) => item.kind === "image")
    .map((item) => ({
      id: item.attachmentId,
      src: item.previewUrl,
      alt: "Photo ready to send",
    }));

  return (
    <div
      ref={conversationHostRef}
      className="relative min-h-0 min-w-0 flex-1 max-md:-mb-[var(--clarity-app-bottom-boundary)] md:h-[calc(100dvh-13rem)] md:flex-none"
    >
      <div
        data-clarity-conversation-panel
        data-clarity-keyboard-open={keyboardLayout.phase === "open" || undefined}
        data-clarity-keyboard-phase={keyboardLayout.phase}
        data-clarity-editor-active={mobileComposerActive || undefined}
        className="flex h-full min-w-0 flex-col bg-background"
      >
        <div
          ref={conversationScrollRef}
          data-clarity-conversation-scroll
          className="relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-none [-webkit-overflow-scrolling:touch]"
          onScroll={handleHistoryScroll}
          aria-live="polite"
        >
          <div
            ref={conversationContentRef}
            data-clarity-history-content
            className={`space-y-3 pb-3 ${
              initialHistoryReady ? "" : "max-md:invisible"
            }`}
          >
            {messages.length === 0 && (
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Tell me what’s on your mind. I’ll use what Clarity already
                knows to help you work out what matters next.
              </p>
            )}
            {messages.map((item) => (
              <div key={item.id} className="space-y-2">
                <ConversationMessage
                  item={item}
                  formAction={formAction}
                  onOpenImages={openImageViewer}
                />
                {item.role === "clarity" && item.proposal && (
                  <ClarityMemoryProposalCard
                    key={`${item.proposal.id}:${item.proposal.revision}:${item.proposal.status}`}
                    proposal={item.proposal}
                  />
                )}
              </div>
            ))}
            {state.fallbackResponse && state.retryMessageId && (
              <ResearchFallbackResponse
                messageId={state.retryMessageId}
                response={state.fallbackResponse}
              />
            )}
          </div>
          <div
            ref={historyBottomInsetRef}
            data-clarity-history-bottom-inset
            className="pointer-events-none w-full"
            aria-hidden="true"
          />
          <div
            ref={conversationEndRef}
            data-clarity-history-end
            className="pointer-events-none absolute bottom-0 left-0 size-px"
            aria-hidden="true"
          />
        </div>

        <div
          ref={composerDockRef}
          data-clarity-composer-dock
          className="relative min-w-0 shrink-0 max-md:fixed max-md:z-50 md:!left-auto md:!right-auto"
          style={composerDockStyle}
        >
          <div
            data-clarity-composer-scrim
            className="pointer-events-none absolute -inset-x-4 -top-12 bottom-0 bg-gradient-to-b from-transparent via-background to-background opacity-90"
            aria-hidden="true"
          />
          {showJumpToLatest && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex -translate-y-[calc(100%+0.5rem)] justify-center">
              <Button
                type="button"
                variant="outline"
                size="icon"
                data-clarity-jump-to-latest
                className="pointer-events-auto size-8 rounded-full border-border bg-card shadow-md backdrop-blur-md"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--card) 95%, transparent)",
                }}
                aria-label="Jump to latest"
                onClick={jumpToLatest}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          <div className="relative z-10 min-w-0 shrink-0 space-y-2 pb-1">
          {(state.error || state.fieldError || mediaError) && (
            <div
              role="alert"
              className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm"
            >
              <p>{mediaError ?? state.fieldError ?? state.error}</p>
              {state.retryMessageId && state.retryKind !== "research" && (
                <RetryMessageForm
                  messageId={state.retryMessageId}
                  formAction={formAction}
                />
              )}
            </div>
          )}

          <form
            ref={composerFormRef}
            data-clarity-composer-shell
            action={formAction}
            onSubmit={handleSubmit}
            onFocusCapture={handleComposerFocus}
            onBlurCapture={handleComposerBlur}
            noValidate
            className="relative min-w-0 rounded-2xl border border-border bg-card p-2 shadow-md backdrop-blur-md"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--card) 95%, transparent)",
            }}
          >
          <InvocationFields
            invocation={attachment?.invocation ?? GENERAL_INVOCATION}
          />

          {draftMedia.length > 0 && (
            <div className="mb-2 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
              {draftMedia.map((item) => (
                <DraftMediaPreview
                  key={item.attachmentId}
                  item={item}
                  onRemove={removeDraft}
                  onOpen={() =>
                    openImageViewer(draftViewerImages, item.attachmentId)
                  }
                />
              ))}
            </div>
          )}

          {dictationStatus === "recording" || dictationStatus === "paused" ? (
            <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-1 px-1">
              <span
                className={`size-2 shrink-0 rounded-full bg-destructive ${
                  dictationStatus === "recording" ? "animate-pulse" : "opacity-50"
                }`}
              />
              <span className="min-w-24 flex-1 text-sm font-medium">
                {dictationStatus === "paused" ? "Paused" : "Recording"} ·{" "}
                {formatElapsed(recordingElapsedMs)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2"
                onClick={
                  dictationStatus === "paused" ? resumeRecording : pauseRecording
                }
                disabled={!canPauseRecording}
              >
                {dictationStatus === "paused" ? (
                  <Play className="size-4" />
                ) : (
                  <Pause className="size-4" />
                )}
                {dictationStatus === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2"
                onClick={cancelRecording}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl px-2.5"
                onClick={stopDictation}
              >
                <Square className="size-4" />
                Stop dictation
              </Button>
            </div>
          ) : dictationStatus === "transcribing" ? (
            <div className="flex min-h-11 min-w-0 items-center gap-2 px-2 text-sm font-medium">
              <LoaderCircle className="size-4 animate-spin" />
              Transcribing…
            </div>
          ) : dictationStatus === "failed" ? (
            <div className="flex min-h-11 min-w-0 items-center gap-2 px-1">
              <span className="min-w-0 flex-1 text-sm">
                I couldn’t transcribe that.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void cancelPendingDictation()}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  pendingDictation && void transcribeDictation(pendingDictation)
                }
                disabled={!pendingDictation}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-end gap-2">
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-xl"
                  aria-label="Add photo"
                  aria-expanded={addMenuOpen}
                  onClick={() => setAddMenuOpen((open) => !open)}
                  disabled={mediaBusy || isPending}
                >
                  <Plus />
                </Button>
                {addMenuOpen && (
                  <div className="absolute bottom-12 left-0 z-20 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera className="size-4" /> Take Photo
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                      onClick={() => libraryInputRef.current?.click()}
                    >
                      <ImagePlus className="size-4" /> Photo Library
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                capture="environment"
                className="hidden"
                onChange={(event) =>
                  void addImages([...(event.target.files ?? [])])
                }
              />
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                multiple
                className="hidden"
                onChange={(event) =>
                  void addImages([...(event.target.files ?? [])])
                }
              />

              <div className="min-w-0 flex-1">
                {attachment && (
                  <button
                    type="button"
                    onClick={removeAttachment}
                    aria-label={`Remove ${attachment.label} context`}
                    className="mx-2 mb-1 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <span className="truncate font-medium text-foreground">
                      {attachment.label}
                    </span>
                    <X className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>
                )}
                <label className="block min-w-0">
                  <span className="sr-only">Message Clarity</span>
                  <textarea
                    ref={composerTextareaRef}
                    name="message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Message Clarity…"
                    rows={1}
                    maxLength={8000}
                    style={{ maxHeight: CLARITY_COMPOSER_MAX_HEIGHT_PX }}
                    className="block min-h-11 w-full min-w-0 touch-pan-y resize-none overflow-y-hidden overscroll-y-contain bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground"
                    disabled={isPending || mediaBusy}
                  />
                </label>
              </div>

              {mediaBusy ? (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl"
                  disabled
                  aria-label="Adding attachment"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                </Button>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11 shrink-0 rounded-xl"
                    onClick={() => void startRecording()}
                    aria-label="Start dictation"
                    disabled={isPending}
                  >
                    <Mic />
                  </Button>
                  {canSend && (
                    <Button
                      type="submit"
                      size="icon"
                      className="size-11 shrink-0 rounded-xl"
                      disabled={isPending}
                      aria-label="Send message"
                    >
                      {isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Send />
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          </form>
          </div>
        </div>
      </div>
      {imageViewer && (
        <ClarityImageViewer
          images={imageViewer.images}
          index={imageViewer.index}
          onIndexChange={(index) =>
            setImageViewer((current) => current ? { ...current, index } : null)
          }
          onClose={closeImageViewer}
        />
      )}
    </div>
  );

  async function uploadDraft(
    file: File,
    kind: "image" | "audio",
    durationMs: number | null,
  ): Promise<DraftMedia> {
    const mimeType = normalizeClarityMimeType(file.type);
    const prepared = await prepareClarityAttachmentAction({
      kind,
      mimeType,
      byteSize: file.size,
      width: null,
      height: null,
      durationMs,
    });
    const supabase = createClient();
    const uploaded = await supabase.storage
      .from(CLARITY_MEDIA_BUCKET)
      .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, {
        contentType: mimeType,
      });
    if (uploaded.error) {
      await discardClarityAttachmentAction({
        attachmentId: prepared.attachmentId,
      }).catch(() => undefined);
      throw new Error(uploaded.error.message);
    }
    return {
      attachmentId: prepared.attachmentId,
      storagePath: prepared.storagePath,
      kind,
      mimeType,
      previewUrl: URL.createObjectURL(file),
      durationMs,
    };
  }

  function stopRecorderTracks() {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderStreamRef.current = null;
    recorderRef.current = null;
  }
}

function ConversationMessage({
  item,
  formAction,
  onOpenImages,
}: {
  item: ClarityConversationMessage;
  formAction: (payload: FormData) => void;
  onOpenImages: (images: ClarityViewerImage[], imageId: string) => void;
}) {
  const sources = item.role === "clarity"
    ? researchSourcesFromMetadata(item.structured_metadata)
    : [];
  const visibleContent = item.role === "clarity"
    ? normalizeClarityVisibleResponse(item.content, sources)
    : item.content;
  const failedAudio = item.attachments.some(
    (media) =>
      media.kind === "audio" && media.transcriptionStatus === "failed",
  );

  return (
    <article
      data-clarity-conversation-message
      data-clarity-message-role={item.role}
      className={
        item.role === "user"
          ? "ml-auto max-w-[88%] min-w-0 overflow-hidden rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
          : "max-w-[94%] min-w-0 overflow-hidden rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-6 text-foreground"
      }
    >
      <p className="mb-1 text-xs font-semibold opacity-70">
        {item.role === "user" ? "You" : "Clarity"}
      </p>
      {item.attachments.length > 0 && (
        <MessageAttachments
          attachments={item.attachments}
          onOpenImages={onOpenImages}
        />
      )}
      {visibleContent && (
        <div className="min-w-0 space-y-3 break-words [overflow-wrap:anywhere]">
          {visibleContent.split(/\n{2,}/).map((paragraph, index) => (
            <p
              key={`${item.id}-paragraph-${index}`}
              className="whitespace-pre-wrap"
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {failedAudio && (
        <RetryMessageForm
          messageId={item.id}
          formAction={formAction}
          label="Retry transcription"
        />
      )}
      {sources.length > 0 && <ResearchSources sources={sources} />}
    </article>
  );
}

function MessageAttachments({
  attachments,
  onOpenImages,
}: {
  attachments: ClarityMessageAttachment[];
  onOpenImages: (images: ClarityViewerImage[], imageId: string) => void;
}) {
  const images = attachments
    .filter((item) => item.kind === "image" && item.signedUrl)
    .map((item) => ({
      id: item.id,
      src: item.signedUrl as string,
      alt: "Attached photo",
      width: item.width,
      height: item.height,
    }));

  return (
    <div className="mb-2 min-w-0 space-y-2">
      <div className="grid min-w-0 grid-cols-2 gap-1.5">
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
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                className="max-h-64 w-full min-w-0 object-cover"
              />
          </button>
        ))}
      </div>
      {attachments
        .filter((item) => item.kind === "audio")
        .map((item) => (
          <div key={item.id} className="min-w-0 space-y-1.5">
            {item.signedUrl && (
              <audio
                controls
                preload="metadata"
                src={item.signedUrl}
                className="h-10 w-full min-w-0 max-w-full"
              />
            )}
            {item.transcript && (
              <details className="text-xs opacity-80">
                <summary className="cursor-pointer">Transcript</summary>
                <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {item.transcript}
                </p>
              </details>
            )}
            {item.transcriptionStatus === "failed" && (
              <p className="text-xs opacity-80">Transcription failed.</p>
            )}
          </div>
        ))}
    </div>
  );
}

function ResearchSources({ sources }: { sources: ClarityResearchSource[] }) {
  const visible = sources.slice(0, 4);
  const remaining = sources.slice(4);
  return (
    <details className="mt-3 min-w-0 border-t border-border/70 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        Sources · {sources.length}
      </summary>
      <ul className="mt-2 min-w-0 space-y-2">
        {visible.map((source) => (
          <SourceLink key={source.url} source={source} />
        ))}
      </ul>
      {remaining.length > 0 && (
        <details className="mt-2 min-w-0">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View all
          </summary>
          <ul className="mt-2 min-w-0 space-y-2">
            {remaining.map((source) => (
              <SourceLink key={source.url} source={source} />
            ))}
          </ul>
        </details>
      )}
    </details>
  );
}

function SourceLink({ source }: { source: ClarityResearchSource }) {
  return (
    <li className="min-w-0">
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          <span className="block font-medium text-foreground">
            {researchPublisherLabel(source)}
          </span>
          {source.title.trim().toLowerCase() !== source.domain.toLowerCase() && (
            <span className="block">{source.title}</span>
          )}
        </span>
        <ExternalLink
          className="mt-0.5 size-3 shrink-0"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

function DraftMediaPreview({
  item,
  onRemove,
  onOpen,
}: {
  item: DraftMedia;
  onRemove: (item: DraftMedia) => void;
  onOpen: () => void;
}) {
  return (
    <div className="relative min-w-0 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary">
      {item.kind === "image" ? (
        <button
          type="button"
          className="block size-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label="Open photo preview"
          onClick={onOpen}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview. */}
          <img
            src={item.previewUrl}
            alt="Photo ready to send"
            className="size-20 object-cover"
          />
        </button>
      ) : (
        <div className="flex w-52 max-w-[70vw] items-center gap-2 p-2 pr-9">
          <audio
            controls
            preload="metadata"
            src={item.previewUrl}
            className="h-9 min-w-0 flex-1"
          />
        </div>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void onRemove(item);
        }}
        aria-label={`Remove ${item.kind}`}
        className="absolute right-0 top-0 z-10 grid size-10 place-items-center rounded-full text-white"
      >
        <span className="grid size-7 place-items-center rounded-full bg-zinc-700/90 shadow-sm ring-1 ring-white/20">
          <X className="size-4" />
        </span>
      </button>
    </div>
  );
}

function RetryMessageForm({
  messageId,
  formAction,
  label = "Retry",
}: {
  messageId: string;
  formAction: (payload: FormData) => void;
  label?: string;
}) {
  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="retryMessageId" value={messageId} />
      <PendingButton
        type="submit"
        variant="outline"
        pendingLabel="Retrying…"
        className="h-9 rounded-lg"
      >
        {label}
      </PendingButton>
    </form>
  );
}

function ResearchFallbackResponse({
  messageId,
  response,
}: {
  messageId: string;
  response: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    retryClarityResearchAction,
    initialClarityConversationActionState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  if (state.success) return null;
  return (
    <article className="max-w-[94%] min-w-0 overflow-hidden rounded-2xl rounded-bl-md bg-card px-4 py-3 text-sm leading-6 text-foreground">
      <p className="mb-1 text-xs font-semibold opacity-70">Clarity</p>
      <div className="min-w-0 space-y-3 break-words [overflow-wrap:anywhere]">
        {response.split(/\n{2,}/).map((paragraph, index) => (
          <p key={`research-fallback-${index}`} className="whitespace-pre-wrap">
            {paragraph}
          </p>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-muted-foreground">
          {state.error}
        </p>
      )}
      <form action={formAction} className="mt-2">
        <input type="hidden" name="retryMessageId" value={messageId} />
        <PendingButton
          type="submit"
          variant="ghost"
          size="sm"
          pendingLabel="Retrying…"
          className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Retry research
        </PendingButton>
      </form>
    </article>
  );
}

function createAttachment(
  invocation: ClarityInvocationDescriptor,
  subjectLabel: string | null,
): ComposerAttachment | null {
  return invocation.type !== "general" && subjectLabel
    ? { invocation, label: subjectLabel }
    : null;
}

function attachmentKey(
  invocation: ClarityInvocationDescriptor,
  subjectLabel: string | null,
) {
  return [
    invocation.type,
    invocation.actionId,
    invocation.calendarCommitmentId,
    invocation.localDate,
    subjectLabel,
  ].join(":");
}

function InvocationFields({
  invocation,
}: {
  invocation: ClarityInvocationDescriptor;
}) {
  return (
    <>
      <input type="hidden" name="invocationType" value={invocation.type} />
      <input type="hidden" name="actionId" value={invocation.actionId ?? ""} />
      <input
        type="hidden"
        name="calendarCommitmentId"
        value={invocation.calendarCommitmentId ?? ""}
      />
      <input type="hidden" name="localDate" value={invocation.localDate ?? ""} />
    </>
  );
}

function preferredRecorderMimeType() {
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(
    (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  );
}

function audioFileName(mimeType: string) {
  if (mimeType === "audio/mp4" || mimeType === "audio/m4a") return "voice.m4a";
  if (mimeType === "audio/ogg") return "voice.ogg";
  return "voice.webm";
}

function formatElapsed(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const next = clarityComposerHeight(textarea.scrollHeight);
  textarea.style.height = `${next.height}px`;
  textarea.style.overflowY = next.scrolls ? "auto" : "hidden";
}
