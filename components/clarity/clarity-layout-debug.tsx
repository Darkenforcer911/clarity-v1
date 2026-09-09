"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export const CLARITY_COMPOSER_GUARD_DEBUG_EVENT =
  "clarity:composer-guard-debug";

const MAX_TRACE_ENTRIES = 400;
const CAPTURE_LABELS = [
  "A_fresh",
  "B_composer_focused",
  "C_first_good_drag",
  "D_second_jitter_drag",
  "E_after_keyboard_close",
  "F_header_overlap",
] as const;

type TraceDetail = Record<string, boolean | number | string | null>;

type TraceEntry = {
  at: string;
  elapsedMs: number;
  event: string;
  detail: TraceDetail | null;
  snapshot: ReturnType<typeof readLayoutSnapshot>;
};

type ElementName =
  | "appHeader"
  | "pageTitle"
  | "pageIntro"
  | "conversationPanel"
  | "history"
  | "composerShell"
  | "textarea"
  | "bottomNav";

const ELEMENT_SELECTORS: Record<ElementName, string> = {
  appHeader: "[data-app-shell-header]",
  pageTitle: "[data-clarity-page-title]",
  pageIntro: "[data-clarity-page-intro]",
  conversationPanel: "[data-clarity-conversation-panel]",
  history: "[data-clarity-conversation-scroll]",
  composerShell: "[data-clarity-composer-shell]",
  textarea: 'textarea[name="message"]',
  bottomNav: 'nav[aria-label="Primary"]',
};

function rounded(value: number | undefined) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

function readElement(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return {
    rect: {
      top: rounded(rect.top),
      bottom: rounded(rect.bottom),
      height: rounded(rect.height),
      left: rounded(rect.left),
      right: rounded(rect.right),
    },
    style: {
      position: style.position,
      top: style.top,
      height: style.height,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      transform: style.transform,
      overflow: style.overflow,
      overflowY: style.overflowY,
    },
  };
}

function elementRegion(target: EventTarget | null) {
  if (!(target instanceof Element)) return "other";
  if (target.closest('[data-clarity-layout-debug]')) return "diagnostic-hud";
  if (target.closest('textarea[name="message"]')) return "textarea";
  if (target.closest("[data-clarity-composer-shell]")) return "composer";
  if (target.closest("[data-clarity-conversation-scroll]")) return "history";
  if (target.closest("[data-app-shell-header]")) return "app-header";
  if (target.closest('nav[aria-label="Primary"]')) return "bottom-nav";
  return "other";
}

function focusedRegion() {
  return elementRegion(document.activeElement);
}

function readLayoutSnapshot() {
  const viewport = window.visualViewport;
  const scrollingElement = document.scrollingElement;
  const htmlStyle = window.getComputedStyle(document.documentElement);
  const bodyStyle = window.getComputedStyle(document.body);
  const history = document.querySelector<HTMLElement>(
    ELEMENT_SELECTORS.history,
  );
  const textarea = document.querySelector<HTMLTextAreaElement>(
    ELEMENT_SELECTORS.textarea,
  );
  const panel = document.querySelector<HTMLElement>(
    ELEMENT_SELECTORS.conversationPanel,
  );
  const bottomNav = document.querySelector<HTMLElement>(
    ELEMENT_SELECTORS.bottomNav,
  );
  const safeAreaProbe = document.querySelector<HTMLElement>(
    "[data-clarity-safe-area-probe]",
  );
  const safeAreaStyle = safeAreaProbe
    ? window.getComputedStyle(safeAreaProbe)
    : null;

  return {
    window: {
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollY: rounded(window.scrollY),
    },
    visualViewport: viewport
      ? {
          height: rounded(viewport.height),
          width: rounded(viewport.width),
          offsetTop: rounded(viewport.offsetTop),
          offsetLeft: rounded(viewport.offsetLeft),
          pageTop: rounded(viewport.pageTop),
          scale: rounded(viewport.scale),
        }
      : null,
    document: {
      scrollingElementScrollTop: rounded(scrollingElement?.scrollTop),
      bodyScrollTop: rounded(document.body.scrollTop),
      documentElementScrollTop: rounded(document.documentElement.scrollTop),
      htmlOverflow: htmlStyle.overflow,
      htmlPosition: htmlStyle.position,
      bodyOverflow: bodyStyle.overflow,
      bodyPosition: bodyStyle.position,
    },
    safeArea: safeAreaStyle
      ? {
          top: safeAreaStyle.paddingTop,
          right: safeAreaStyle.paddingRight,
          bottom: safeAreaStyle.paddingBottom,
          left: safeAreaStyle.paddingLeft,
        }
      : null,
    elements: Object.fromEntries(
      Object.entries(ELEMENT_SELECTORS).map(([name, selector]) => [
        name,
        readElement(selector),
      ]),
    ),
    scroll: {
      history: history
        ? {
            scrollTop: rounded(history.scrollTop),
            scrollHeight: history.scrollHeight,
            clientHeight: history.clientHeight,
          }
        : null,
      textarea: textarea
        ? {
            scrollTop: rounded(textarea.scrollTop),
            scrollHeight: textarea.scrollHeight,
            clientHeight: textarea.clientHeight,
          }
        : null,
    },
    focus: {
      activeRegion: focusedRegion(),
      textareaFocused: document.activeElement === textarea,
      keyboardActive: panel?.dataset.clarityKeyboardOpen === "true",
      editorActive: panel?.dataset.clarityEditorActive === "true",
      bottomNavHidden: !bottomNav,
    },
    composerGuardInstalled:
      textarea?.dataset.clarityComposerGuardInstalled === "true",
  };
}

export function ClarityLayoutDebug() {
  const entriesRef = useRef<TraceEntry[]>([]);
  const recordingRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const composerTouchIdentifierRef = useRef<number | null>(null);
  const guardMovementRef = useRef<{
    identifier: number;
    guardRan: boolean;
    contained: boolean | null;
  } | null>(null);
  const countFrameRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [captureLabel, setCaptureLabel] =
    useState<(typeof CAPTURE_LABELS)[number]>("A_fresh");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const updateCount = useCallback(() => {
    if (countFrameRef.current !== null) return;
    countFrameRef.current = window.requestAnimationFrame(() => {
      countFrameRef.current = null;
      setEntryCount(entriesRef.current.length);
    });
  }, []);

  const capture = useCallback(
    (event: string, detail: TraceDetail | null = null, force = false) => {
      if (!recordingRef.current && !force) return;
      const entry: TraceEntry = {
        at: new Date().toISOString(),
        elapsedMs:
          rounded(
            sessionStartedAtRef.current === 0
              ? 0
              : performance.now() - sessionStartedAtRef.current,
          ) ?? 0,
        event,
        detail,
        snapshot: readLayoutSnapshot(),
      };
      entriesRef.current.push(entry);
      if (entriesRef.current.length > MAX_TRACE_ENTRIES) {
        entriesRef.current.splice(
          0,
          entriesRef.current.length - MAX_TRACE_ENTRIES,
        );
      }
      updateCount();
    },
    [updateCount],
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const history = document.querySelector<HTMLElement>(
      ELEMENT_SELECTORS.history,
    );
    const textarea = document.querySelector<HTMLTextAreaElement>(
      ELEMENT_SELECTORS.textarea,
    );

    const captureSimple = (event: Event) => capture(event.type);
    const captureViewport = (event: Event) =>
      capture(`visualViewport:${event.type}`);
    const captureWindowScroll = () => capture("window:scroll");
    const captureDocumentScroll = (event: Event) => {
      if (
        event.target === document ||
        event.target === document.documentElement ||
        event.target === document.body
      ) {
        capture("document:scroll");
      }
    };
    const captureHistoryScroll = () => capture("history:scroll");
    const captureTextareaScroll = () => capture("textarea:scroll");
    const captureTouch = (event: TouchEvent) => {
      if (!recordingRef.current) return;
      const region = elementRegion(event.target);
      if (event.type === "touchstart") {
        if (region !== "composer" && region !== "textarea") return;
        composerTouchIdentifierRef.current =
          event.touches.length === 1 ? event.touches[0]?.identifier ?? null : null;
      }
      const identifier = composerTouchIdentifierRef.current;
      if (identifier === null) return;
      if (event.type === "touchmove") {
        guardMovementRef.current = {
          identifier,
          guardRan: false,
          contained: null,
        };
      }
      const detail = {
        activeTouchIdentifier: identifier,
        targetRegion: region,
        cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented,
        guardInstalled:
          textarea?.dataset.clarityComposerGuardInstalled === "true",
        guardRan: false,
      };
      queueMicrotask(() => {
        const guardMovement = guardMovementRef.current;
        capture(event.type, {
          ...detail,
          defaultPrevented: event.defaultPrevented,
          guardInstalled:
            textarea?.dataset.clarityComposerGuardInstalled === "true",
          guardRan:
            guardMovement?.identifier === identifier
              ? guardMovement.guardRan
              : false,
          guardContained:
            guardMovement?.identifier === identifier
              ? guardMovement.contained
              : null,
        });
      });
      if (event.type === "touchend" || event.type === "touchcancel") {
        const ended = Array.from(event.changedTouches).some(
          (touch) => touch.identifier === identifier,
        );
        if (ended) {
          composerTouchIdentifierRef.current = null;
          guardMovementRef.current = null;
        }
      }
    };
    const captureGuard = (event: Event) => {
      if (!recordingRef.current) return;
      const customEvent = event as CustomEvent<TraceDetail>;
      const detail = customEvent.detail ?? null;
      if (
        detail?.phase === "move" &&
        typeof detail.identifier === "number"
      ) {
        guardMovementRef.current = {
          identifier: detail.identifier,
          guardRan: detail.guardRan === true,
          contained:
            typeof detail.contained === "boolean" ? detail.contained : null,
        };
        return;
      }
      capture("composer-guard", detail);
    };

    window.addEventListener("resize", captureSimple);
    window.addEventListener("scroll", captureWindowScroll, { passive: true });
    document.addEventListener("scroll", captureDocumentScroll, {
      passive: true,
      capture: true,
    });
    document.addEventListener("focusin", captureSimple);
    document.addEventListener("focusout", captureSimple);
    window.addEventListener("touchstart", captureTouch, { passive: true });
    window.addEventListener("touchmove", captureTouch, { passive: true });
    window.addEventListener("touchend", captureTouch, { passive: true });
    window.addEventListener("touchcancel", captureTouch, { passive: true });
    window.addEventListener(CLARITY_COMPOSER_GUARD_DEBUG_EVENT, captureGuard);
    viewport?.addEventListener("resize", captureViewport);
    viewport?.addEventListener("scroll", captureViewport);
    history?.addEventListener("scroll", captureHistoryScroll, { passive: true });
    textarea?.addEventListener("scroll", captureTextareaScroll, {
      passive: true,
    });

    const interval = window.setInterval(() => capture("layout:sample"), 250);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", captureSimple);
      window.removeEventListener("scroll", captureWindowScroll);
      document.removeEventListener("scroll", captureDocumentScroll, true);
      document.removeEventListener("focusin", captureSimple);
      document.removeEventListener("focusout", captureSimple);
      window.removeEventListener("touchstart", captureTouch);
      window.removeEventListener("touchmove", captureTouch);
      window.removeEventListener("touchend", captureTouch);
      window.removeEventListener("touchcancel", captureTouch);
      window.removeEventListener(CLARITY_COMPOSER_GUARD_DEBUG_EVENT, captureGuard);
      viewport?.removeEventListener("resize", captureViewport);
      viewport?.removeEventListener("scroll", captureViewport);
      history?.removeEventListener("scroll", captureHistoryScroll);
      textarea?.removeEventListener("scroll", captureTextareaScroll);
      if (countFrameRef.current !== null) {
        window.cancelAnimationFrame(countFrameRef.current);
      }
    };
  }, [capture]);

  function startRecording() {
    sessionStartedAtRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
    setCopyStatus("idle");
    capture("recording:start", null, true);
  }

  function stopRecording() {
    capture("recording:stop", null, true);
    recordingRef.current = false;
    setRecording(false);
  }

  function clearTrace() {
    entriesRef.current = [];
    setEntryCount(0);
    setCopyStatus("idle");
  }

  async function copyTrace() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            format: "clarity-layout-debug-v1",
            exportedAt: new Date().toISOString(),
            entryCount: entriesRef.current.length,
            entries: entriesRef.current,
          },
          null,
          2,
        ),
      );
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <>
      <span
        data-clarity-safe-area-probe
        aria-hidden="true"
        className="pointer-events-none invisible fixed size-0"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
        }}
      />
      <aside
        data-clarity-layout-debug
        aria-label="Layout diagnostics"
        className="fixed right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[100] w-[min(18rem,calc(100vw-1rem))] rounded-xl border border-border bg-card/95 p-2 text-xs shadow-lg backdrop-blur"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left font-semibold"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
        >
          <span>Layout debug</span>
          <span className="text-muted-foreground">
            {recording ? "Recording" : `${entryCount} entries`} ·{" "}
            {collapsed ? "Open" : "Close"}
          </span>
        </button>

        {!collapsed && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={startRecording}
                disabled={recording}
              >
                Start recording
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={stopRecording}
                disabled={!recording}
              >
                Stop recording
              </Button>
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground">State label</span>
              <select
                value={captureLabel}
                onChange={(event) =>
                  setCaptureLabel(
                    event.target.value as (typeof CAPTURE_LABELS)[number],
                  )
                }
                className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs"
              >
                {CAPTURE_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() =>
                capture("state:capture", { label: captureLabel }, true)
              }
            >
              Capture state
            </Button>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void copyTrace()}
                disabled={entryCount === 0}
              >
                Copy trace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearTrace}
                disabled={entryCount === 0}
              >
                Clear
              </Button>
            </div>
            <p aria-live="polite" className="text-muted-foreground">
              {copyStatus === "copied"
                ? "Trace copied."
                : copyStatus === "failed"
                  ? "Copy failed. Try again."
                  : `${entryCount}/${MAX_TRACE_ENTRIES} in memory only.`}
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
