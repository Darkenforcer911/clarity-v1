"use client";

import {
  ArrowDown,
  Camera,
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
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  discardClarityAttachmentAction,
  prepareClarityAttachmentAction,
  transcribeClarityDictationAction,
} from "@/app/(app)/clarity/actions";
import {
  retryOnboardingMessageAction,
  sendOnboardingMessageAction,
} from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import {
  ClarityImageViewer,
  type ClarityViewerImage,
} from "@/components/clarity/clarity-image-viewer";
import { initialOnboardingActionState } from "@/lib/clarity/onboarding-action-state";
import {
  CLARITY_MEDIA_BUCKET,
  MAX_CLARITY_AUDIO_BYTES,
  MAX_CLARITY_AUDIO_DURATION_MS,
  MAX_CLARITY_IMAGE_BYTES,
  MAX_CLARITY_IMAGE_COUNT,
  clarityImageMimeTypes,
  normalizeClarityMimeType,
} from "@/lib/clarity/ai/clarity-attachments";
import {
  CLARITY_COMPOSER_MAX_HEIGHT_PX,
  clarityComposerHeight,
} from "@/lib/clarity/ai/clarity-composer";
import {
  appendDictationTranscript,
  type ClarityDictationStatus,
} from "@/lib/clarity/ai/clarity-dictation";
import { normalizeClarityImageFile } from "@/lib/clarity/ai/clarity-image-normalization";
import { createClient } from "@/lib/supabase/client";

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

type ImageViewerState = {
  images: ClarityViewerImage[];
  index: number;
};

export function OnboardingConversationComposer({
  preview,
  showJumpToLatest,
  onJumpToLatest,
  onConversationChanged,
  onPreviewSend,
}: {
  preview: boolean;
  showJumpToLatest: boolean;
  onJumpToLatest: () => void;
  onConversationChanged: () => void;
  onPreviewSend: (content: string) => void;
}) {
  const [sendState, sendAction, isPending] = useActionState(
    sendOnboardingMessageAction,
    initialOnboardingActionState,
  );
  const [retryState, retryAction, isRetrying] = useActionState(
    retryOnboardingMessageAction,
    initialOnboardingActionState,
  );
  const lastSendCompletedAtRef = useRef<number | undefined>(undefined);
  const lastRetryCompletedAtRef = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const activeRecordingStartedAtRef = useRef(0);
  const recordedDurationMsRef = useRef(0);
  const cancelRecordingRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dictationDraftPositionPendingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [draftMedia, setDraftMedia] = useState<DraftMedia[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [dictationStatus, setDictationStatus] =
    useState<ClarityDictationStatus>("idle");
  const [pendingDictation, setPendingDictation] =
    useState<PendingDictation | null>(null);
  const [canPauseRecording, setCanPauseRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const canSend = Boolean(message.trim() || draftMedia.length > 0);
  const draftViewerImages = draftMedia
    .filter((item) => item.kind === "image")
    .map((item) => ({
      id: item.attachmentId,
      src: item.previewUrl,
      alt: "Photo ready to send",
    }));

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const sizing = clarityComposerHeight(textarea.scrollHeight);
    textarea.style.height = `${sizing.height}px`;
    textarea.style.overflowY = sizing.scrolls ? "auto" : "hidden";

    if (!dictationDraftPositionPendingRef.current) return;
    dictationDraftPositionPendingRef.current = false;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
    textarea.scrollTop = textarea.scrollHeight;
  }, [message, dictationStatus]);

  useEffect(() => {
    if (
      !sendState.completedAt ||
      sendState.completedAt === lastSendCompletedAtRef.current
    ) {
      return;
    }
    lastSendCompletedAtRef.current = sendState.completedAt;
    if (sendState.status !== "success" && !sendState.retryMessageId) return;
    queueMicrotask(() => {
      setMessage("");
      setDraftMedia((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      setDictationStatus("idle");
      onConversationChanged();
    });
  }, [
    onConversationChanged,
    sendState.completedAt,
    sendState.retryMessageId,
    sendState.status,
  ]);

  useEffect(() => {
    if (
      !retryState.completedAt ||
      retryState.completedAt === lastRetryCompletedAtRef.current
    ) {
      return;
    }
    lastRetryCompletedAtRef.current = retryState.completedAt;
    if (retryState.status !== "success") return;
    queueMicrotask(onConversationChanged);
  }, [onConversationChanged, retryState.completedAt, retryState.status]);

  useEffect(() => {
    if (!addMenuOpen) return;

    const closeMenu = () => setAddMenuOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && addMenuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, [addMenuOpen]);

  useEffect(
    () => () => {
      stopRecorderTracks();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    },
    [],
  );

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
      await discardClarityAttachmentAction({ attachmentId: item.attachmentId });
    } catch {
      setMediaError("That attachment couldn’t be removed. Try again.");
    }
  }

  async function startRecording() {
    setMediaError(null);
    setAddMenuOpen(false);
    if (!window.isSecureContext) {
      setMediaError("Dictation needs a secure connection. Try again over HTTPS.");
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
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
      setMessage((current) => appendDictationTranscript(current, result.transcript));
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      isPending ||
      mediaBusy ||
      ["recording", "paused", "transcribing", "failed"].includes(
        dictationStatus,
      )
    ) {
      event.preventDefault();
      return;
    }
    if (!canSend) {
      event.preventDefault();
      setMediaError("Write a message or add something first.");
      return;
    }
    setMediaError(null);
    if (!preview) return;
    event.preventDefault();
    onPreviewSend(message.trim());
    setMessage("");
    setDraftMedia((current) => {
      current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        void discardClarityAttachmentAction({
          attachmentId: item.attachmentId,
        }).catch(() => undefined);
      });
      return [];
    });
  }

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

  function clearRecordingTimer() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function openDraftViewer(imageId: string) {
    const index = draftViewerImages.findIndex((image) => image.id === imageId);
    if (index >= 0) setImageViewer({ images: draftViewerImages, index });
  }

  return (
    <div className="relative shrink-0 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
      {showJumpToLatest && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex -translate-y-[calc(100%+0.5rem)] justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto size-8 rounded-full border-border bg-card shadow-md backdrop-blur-md"
            aria-label="Jump to latest"
            onClick={onJumpToLatest}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {(sendState.fieldError || sendState.message || retryState.message || mediaError) && (
        <div role="alert" className="mb-2 rounded-xl bg-secondary px-3 py-2 text-sm">
          <p>
            {mediaError ??
              sendState.fieldError ??
              sendState.message ??
              retryState.message}
          </p>
          {sendState.retryMessageId && (
            <form action={retryAction} className="mt-2">
              <input
                type="hidden"
                name="retryMessageId"
                value={sendState.retryMessageId}
              />
              <Button type="submit" size="sm" disabled={isRetrying}>
                {isRetrying ? "Retrying…" : "Retry"}
              </Button>
            </form>
          )}
        </div>
      )}

      <form
        action={preview ? undefined : sendAction}
        onSubmit={handleSubmit}
        noValidate
        className="relative min-w-0 rounded-2xl border border-border bg-card p-2 shadow-sm"
      >
        {draftMedia.length > 0 && (
          <div className="mb-2 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
            {draftMedia.map((item) => (
              <div
                key={item.attachmentId}
                className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary"
              >
                <button
                  type="button"
                  className="size-full"
                  aria-label="Open photo ready to send"
                  onClick={() => openDraftViewer(item.attachmentId)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- draft media uses an ephemeral object URL. */}
                  <img
                    src={item.previewUrl}
                    alt="Photo ready to send"
                    className="size-full object-cover"
                  />
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-1 top-1 size-7 rounded-full bg-background/90"
                  aria-label="Remove photo"
                  onClick={() => void removeDraft(item)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
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
              onClick={dictationStatus === "paused" ? resumeRecording : pauseRecording}
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
          <div className="flex min-h-11 items-center gap-2 px-2 text-sm font-medium">
            <LoaderCircle className="size-4 animate-spin" /> Transcribing…
          </div>
        ) : dictationStatus === "failed" ? (
          <div className="flex min-h-11 min-w-0 items-center gap-2 px-1">
            <span className="min-w-0 flex-1 text-sm">I couldn’t transcribe that.</span>
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
              disabled={!pendingDictation}
              onClick={() =>
                pendingDictation && void transcribeDictation(pendingDictation)
              }
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 items-end gap-2">
            <div ref={addMenuRef} className="relative shrink-0">
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
                    onClick={() => {
                      setAddMenuOpen(false);
                      cameraInputRef.current?.click();
                    }}
                  >
                    <Camera className="size-4" /> Take Photo
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                    onClick={() => {
                      setAddMenuOpen(false);
                      libraryInputRef.current?.click();
                    }}
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
              onChange={(event) => void addImages([...(event.target.files ?? [])])}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
              multiple
              className="hidden"
              onChange={(event) => void addImages([...(event.target.files ?? [])])}
            />

            <label className="min-w-0 flex-1">
              <span className="sr-only">Message Clarity</span>
              <textarea
                ref={textareaRef}
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onFocus={() => setAddMenuOpen(false)}
                placeholder="Message Clarity…"
                rows={1}
                maxLength={10_000}
                style={{ maxHeight: CLARITY_COMPOSER_MAX_HEIGHT_PX }}
                className="block min-h-11 w-full min-w-0 touch-pan-y resize-none overflow-y-hidden overscroll-y-contain bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground"
                disabled={isPending || mediaBusy}
              />
            </label>

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
                  variant="ghost"
                  size="icon"
                  className="size-11 rounded-xl"
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
                    className="size-11 rounded-xl"
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

        {draftMedia.map((item) => (
          <input
            key={item.attachmentId}
            type="hidden"
            name="attachmentId"
            value={item.attachmentId}
          />
        ))}
      </form>

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
    </div>
  );
}

function preferredRecorderMimeType() {
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(
    (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  );
}

function audioFileName(mimeType: string) {
  if (mimeType.includes("mp4")) return "dictation.m4a";
  if (mimeType.includes("ogg")) return "dictation.ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "dictation.mp3";
  }
  return "dictation.webm";
}

function formatElapsed(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
