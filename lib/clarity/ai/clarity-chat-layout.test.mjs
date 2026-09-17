import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clarityComposerKeyboardBottomOffset,
  clarityConversationBottom,
  clarityHistoryDistanceFromBottom,
  clarityHistoryBottomInset,
  CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX,
  CLARITY_HISTORY_NEAR_BOTTOM_PX,
  CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX,
  CLARITY_KEYBOARD_DISMISS_FALLBACK_MS,
  CLARITY_KEYBOARD_DISMISS_SETTLE_MS,
  CLARITY_KEYBOARD_THRESHOLD_PX,
  CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX,
  CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX,
  isClarityKeyboardOpen,
  isClarityHistoryNearBottom,
  isClarityViewportNearResting,
  resolveClarityInitialHistoryMeasurement,
  resolveClarityKeyboardDismissalDelay,
  resolveClarityKeyboardPhase,
} from "./clarity-chat-layout.ts";
import {
  preventClarityHistoryGestureDefault,
  resolveClarityHistoryGesture,
} from "./clarity-history-gesture.ts";

const ui = readFileSync(
  new URL("../../../components/clarity/clarity-conversation.tsx", import.meta.url),
  "utf8",
);
const clarityPage = readFileSync(
  new URL("../../../app/(app)/clarity/page.tsx", import.meta.url),
  "utf8",
);
const appShell = readFileSync(
  new URL("../../../components/clarity/app-shell.tsx", import.meta.url),
  "utf8",
);
const bottomNavigation = readFileSync(
  new URL("../../../components/clarity/bottom-navigation.tsx", import.meta.url),
  "utf8",
);
const appShellContext = readFileSync(
  new URL(
    "../../../components/clarity/app-shell-editor-context.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("a long conversation initializes at its exact legal bottom", () => {
  assert.equal(
    clarityConversationBottom({ clientHeight: 500, scrollHeight: 4_500 }),
    4_000,
  );
  assert.match(
    ui,
    /const expectedBottom = clarityConversationBottom\(current\);[\s\S]*history\.scrollTop = expectedBottom[\s\S]*actualScrollTop: history\.scrollTop/,
    "the actual history owner writes and verifies its legal bottom",
  );
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /overflow-y-auto/);
  assert.match(
    ui,
    /new ResizeObserver\(\(\) => \{[\s\S]*observer\.observe\(history\);[\s\S]*observer\.observe\(content\)/,
    "initial positioning observes the real scroll owner and message content",
  );
  assert.match(ui, /data-clarity-history-end/);
});

test("latest-message proximity uses one deterministic 64px boundary", () => {
  const history = { clientHeight: 500, scrollHeight: 4_500 };

  assert.equal(CLARITY_HISTORY_NEAR_BOTTOM_PX, 64);
  assert.equal(
    clarityHistoryDistanceFromBottom({ ...history, scrollTop: 3_920 }),
    80,
  );
  assert.equal(
    isClarityHistoryNearBottom({ ...history, scrollTop: 3_936 }),
    true,
  );
  assert.equal(
    isClarityHistoryNearBottom({ ...history, scrollTop: 3_935 }),
    false,
  );
  assert.equal(
    isClarityHistoryNearBottom({
      ...history,
      scrollTop: 3_920,
      threshold: 80,
    }),
    true,
  );
});

test("first mount and route re-entry each get a fresh history initializer", () => {
  assert.match(
    ui,
    /export function ClarityConversation[\s\S]*const initialPositionedRef = useRef\(messages\.length === 0\)[\s\S]*const initialHistoryObserverRef = useRef<ResizeObserver \| null>\(null\)/,
    "the position guard remains local to the retained Clarity route",
  );
  assert.match(
    ui,
    /useLayoutEffect\(\(\) => \{[\s\S]*Next cacheComponents retains this route in an Activity boundary[\s\S]*initialPositionedRef\.current = empty;[\s\S]*initialHistoryGeometryRef\.current = null;[\s\S]*initialHistoryObserverDeliveredRef\.current = false;[\s\S]*setInitialHistoryReady\(empty\)/,
    "Activity effect reconnection resets entry-only positioning without discarding draft state",
  );
  assert.match(
    ui,
    /return \(\) => \{[\s\S]*initialHistoryObserverRef\.current\?\.disconnect\(\)[\s\S]*cancelAnimationFrame\(initialPositionFrameRef\.current\)/,
    "route deactivation releases only initialization work",
  );
  assert.doesNotMatch(ui, /sessionStorage|localStorage[^\n]*initialPosition/);
  assert.doesNotMatch(ui, /initialConversationSnapshot|initialConversationStableFrames/);
});

test("a provisional zero range cannot latch when observed geometry changes", () => {
  const zero = { clientHeight: 500, contentHeight: 500, scrollHeight: 500 };
  const overflow = { clientHeight: 500, contentHeight: 600, scrollHeight: 600 };
  const first = resolveClarityInitialHistoryMeasurement({
    actualScrollTop: 0,
    current: zero,
    observerDelivered: true,
    previous: null,
  });
  const changed = resolveClarityInitialHistoryMeasurement({
    actualScrollTop: 100,
    current: overflow,
    observerDelivered: true,
    previous: zero,
  });
  const stable = resolveClarityInitialHistoryMeasurement({
    actualScrollTop: 100,
    current: overflow,
    observerDelivered: true,
    previous: overflow,
  });

  assert.equal(first.expectedBottom, 0);
  assert.equal(first.ready, false);
  assert.equal(changed.expectedBottom, 100);
  assert.equal(changed.ready, false);
  assert.equal(stable.ready, true);
});

test("a genuinely short stable conversation initializes at zero", () => {
  const short = { clientHeight: 500, contentHeight: 240, scrollHeight: 500 };
  assert.equal(CLARITY_HISTORY_GEOMETRY_TOLERANCE_PX, 1);
  assert.deepEqual(
    resolveClarityInitialHistoryMeasurement({
      actualScrollTop: 0,
      current: short,
      observerDelivered: true,
      previous: short,
    }),
    { expectedBottom: 0, ready: true },
  );
  assert.equal(
    resolveClarityInitialHistoryMeasurement({
      actualScrollTop: 0,
      current: short,
      observerDelivered: false,
      previous: short,
    }).ready,
    false,
    "a stable number is not accepted before the observer has seen real layout",
  );
});

test("history initialization hides only content and disconnects permanently", () => {
  assert.match(ui, /data-clarity-history-content/);
  assert.match(ui, /initialHistoryReady \? "" : "max-md:invisible"/);
  assert.doesNotMatch(
    ui,
    /data-clarity-conversation-scroll[\s\S]{0,300}max-md:invisible/,
    "the scroll owner itself stays mounted and visible",
  );
  assert.match(
    ui,
    /const disconnect = \(\) => \{[\s\S]*initialHistoryObserverRef\.current\?\.disconnect\(\)[\s\S]*scheduleInitialHistoryMeasurementRef\.current = null/,
  );
  assert.match(
    ui,
    /if \(measurement\.ready\) \{[\s\S]*initialPositionedRef\.current = true;[\s\S]*disconnect\(\);[\s\S]*setInitialHistoryReady\(true\)/,
  );
  assert.match(
    ui,
    /const \[initialHistoryReady, setInitialHistoryReady\] = useState\([\s\S]*messages\.length === 0[\s\S]*\)/,
    "empty conversations render immediately",
  );
});

test("mobile conversation panel remains native flex layout in every keyboard phase", () => {
  assert.match(
    clarityPage,
    /data-clarity-conversation-route/,
  );
  assert.match(
    appShell,
    /clarityConversationRouteActive[\s\S]*max-md:flex max-md:h-svh/,
  );
  assert.match(
    appShell,
    /clarityConversationRouteActive[\s\S]*max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col/,
  );
  assert.match(
    appShellContext,
    /export function useAppShellConversationRoute\(\)[\s\S]*useLayoutEffect\(\(\) => \{[\s\S]*register\?\.\(true\);[\s\S]*return \(\) => register\?\.\(false\)/,
    "React Activity effect cleanup/reactivation owns the active route state",
  );
  assert.match(ui, /useAppShellConversationRoute\(\)/);
  assert.doesNotMatch(
    appShell,
    /:has-\[\[data-clarity-conversation-route\]\]/,
    "an inactive retained Clarity tree cannot keep route-only App Shell layout active",
  );
  assert.match(clarityPage, /flex min-h-0 flex-1 flex-col gap-5/);
  assert.match(clarityPage, /header className="shrink-0 space-y-2"/);
  assert.match(
    ui,
    /className="relative min-h-0 min-w-0 flex-1 max-md:-mb-\[var\(--clarity-app-bottom-boundary\)\] md:h-\[calc\(100dvh-13rem\)\] md:flex-none"/,
  );
  assert.match(
    ui,
    /data-clarity-conversation-panel[\s\S]*className="flex h-full min-w-0 flex-col bg-background"/,
    "the panel never leaves its bounded flex slot",
  );
  assert.doesNotMatch(ui, /fixedKeyboardPanel|conversationPanelStyle/);
  assert.doesNotMatch(
    ui,
    /data-clarity-conversation-panel[\s\S]{0,300}\bfixed\b/,
  );
  assert.match(
    ui,
    /messages\.length === 0[\s\S]*Tell me what’s on your mind/,
    "the same readiness boundary retains the empty-conversation state",
  );
});

test("the visual viewport changes only the persistent composer boundary", () => {
  assert.equal(
    isClarityKeyboardOpen({
      baselineHeight: 780,
      visibleHeight: 430,
      visibleOffsetTop: 40,
    }),
    true,
  );
  assert.equal(
    isClarityKeyboardOpen({
      baselineHeight: 780,
      visibleHeight: 730,
      visibleOffsetTop: 0,
    }),
    false,
  );
  assert.equal(
    clarityComposerKeyboardBottomOffset({
      layoutViewportHeight: 780,
      visibleHeight: 430,
      visibleOffsetTop: 40,
    }),
    310,
  );
  assert.equal(
    clarityComposerKeyboardBottomOffset({
      layoutViewportHeight: 400,
      visibleHeight: 400,
      visibleOffsetTop: 0,
    }),
    0,
    "a keyboard-sized layout viewport keeps the complete fixed composer inside that viewport",
  );
  assert.match(
    ui,
    /layoutViewportHeight: window\.innerHeight,[\s\S]*visibleHeight,[\s\S]*visibleOffsetTop/,
    "fixed-position CSS and its bottom offset use the same current layout viewport",
  );
  assert.doesNotMatch(
    ui,
    /layoutViewportHeight: Math\.max\([\s\S]{0,120}baselineViewportHeightRef/,
  );
  assert.match(ui, /data-clarity-composer-dock/);
  assert.match(
    ui,
    /max-md:fixed max-md:z-50 md:!left-auto md:!right-auto/,
    "mobile horizontal offsets are neutralized when the dock returns to relative desktop flow",
  );
  assert.doesNotMatch(
    ui,
    /md:!bottom-auto/,
    "the shared app-bottom boundary still keeps the desktop dock above fixed navigation",
  );
  assert.match(
    ui,
    /bottom:[\s\S]*keyboardLayout\.bottomOffset === null[\s\S]*var\(--clarity-app-bottom-boundary\)/,
  );
});

test("visual keyboard geometry survives focusout until the viewport closes", () => {
  const openGeometry = {
    baselineHeight: 775,
    visibleHeight: 417,
    visibleOffsetTop: 358,
  };
  assert.equal(
    resolveClarityKeyboardPhase({
      ...openGeometry,
      previouslyOpen: true,
      dismissalPending: false,
    }),
    "open",
  );
  assert.equal(
    clarityComposerKeyboardBottomOffset({
      layoutViewportHeight: 775,
      visibleHeight: 417,
      visibleOffsetTop: 358,
    }),
    0,
    "the composer uses the visible bottom directly even when WebKit pans the viewport",
  );

  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 775,
      visibleHeight: 700,
      visibleOffsetTop: 0,
      previouslyOpen: true,
      dismissalPending: false,
    }),
    "open",
    "closing hysteresis retains keyboard ownership during partial expansion",
  );
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 775,
      visibleHeight: 775,
      visibleOffsetTop: 0,
      previouslyOpen: true,
      dismissalPending: false,
    }),
    "closing",
  );
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 775,
      visibleHeight: 775,
      visibleOffsetTop: 0,
      previouslyOpen: false,
      dismissalPending: false,
    }),
    "closed",
  );
});

test("standalone PWA keyboard hysteresis closes a residual 59px viewport gap", () => {
  assert.equal(CLARITY_KEYBOARD_THRESHOLD_PX, 96);
  assert.equal(CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX, 64);

  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 932,
      visibleHeight: 519,
      visibleOffsetTop: 354,
      previouslyOpen: true,
      dismissalPending: false,
    }),
    "open",
  );
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 932,
      visibleHeight: 873,
      visibleOffsetTop: 0,
      previouslyOpen: true,
      dismissalPending: false,
    }),
    "closing",
  );
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 932,
      visibleHeight: 873,
      visibleOffsetTop: 0,
      previouslyOpen: false,
      dismissalPending: false,
    }),
    "closed",
    "the 96px opening threshold prevents a resting 59px gap from opening the keyboard",
  );
});

test("keyboard dismissal holds through late PWA viewport settling pulses", () => {
  const dismissalStartedAt = 0;
  const deadlineFor = (observedAt, visibleHeight, visibleOffsetTop = 0) =>
    observedAt +
    resolveClarityKeyboardDismissalDelay({
      dismissalStartedAt,
      observedAt,
      baselineHeight: 932,
      visibleHeight,
      visibleOffsetTop,
    });

  assert.equal(CLARITY_KEYBOARD_DISMISS_SETTLE_MS, 120);
  assert.equal(CLARITY_KEYBOARD_DISMISS_FALLBACK_MS, 450);
  assert.equal(CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX, 8);
  assert.equal(CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX, 1);
  assert.equal(
    isClarityViewportNearResting({
      baselineHeight: 932,
      visibleHeight: 928,
      visibleOffsetTop: 1,
    }),
    true,
    "minor viewport rounding remains near the recorded resting baseline",
  );
  assert.equal(
    isClarityViewportNearResting({
      baselineHeight: 932,
      visibleHeight: 912,
      visibleOffsetTop: 0,
    }),
    false,
    "the observed 20px pulse is not resting geometry",
  );
  assert.equal(
    isClarityViewportNearResting({
      baselineHeight: 932,
      visibleHeight: 932,
      visibleOffsetTop: 2,
    }),
    false,
    "a viewport that is still offset is not resting geometry",
  );
  assert.equal(
    isClarityViewportNearResting({
      baselineHeight: 932,
      visibleHeight: 519,
      visibleOffsetTop: 354,
    }),
    false,
  );

  const residualDeadline = deadlineFor(0, 873);
  assert.equal(residualDeadline, 450, "the residual close cannot commit early");

  const firstBaselineDeadline = deadlineFor(241, 932);
  assert.equal(firstBaselineDeadline, 361);
  assert.ok(271 < firstBaselineDeadline, "the 912px pulse arrives before commit");

  const intermediatePulseDeadline = deadlineFor(271, 912);
  assert.equal(intermediatePulseDeadline, 450);
  assert.ok(304 < intermediatePulseDeadline, "the final pulse arrives before commit");

  const finalDeadline = deadlineFor(304, 932);
  assert.equal(finalDeadline, 424, "only the final quiet period can commit");
});

test("keyboard dismissal has a bounded residual-only fallback", () => {
  assert.equal(
    resolveClarityKeyboardDismissalDelay({
      dismissalStartedAt: 0,
      observedAt: 0,
      baselineHeight: 932,
      visibleHeight: 873,
      visibleOffsetTop: 0,
    }),
    450,
  );
  assert.equal(
    resolveClarityKeyboardDismissalDelay({
      dismissalStartedAt: 0,
      observedAt: 450,
      baselineHeight: 932,
      visibleHeight: 873,
      visibleOffsetTop: 0,
    }),
    0,
    "a PWA that remains at the residual height cannot stay pending",
  );
});

test("reopen cancels dismissal while ordinary closed resizing stays immediate", () => {
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 932,
      visibleHeight: 519,
      visibleOffsetTop: 354,
      previouslyOpen: true,
      dismissalPending: true,
    }),
    "open",
  );
  assert.equal(
    resolveClarityKeyboardPhase({
      baselineHeight: 932,
      visibleHeight: 912,
      visibleOffsetTop: 0,
      previouslyOpen: false,
      dismissalPending: false,
    }),
    "closed",
  );
  assert.match(
    ui,
    /if \(keyboardOpen && keyboardDismissalPendingRef\.current\) \{\s*cancelKeyboardDismissal\(\)/,
  );
  assert.match(
    ui,
    /clearTimeout\(keyboardDismissalSettleTimerRef\.current\)[\s\S]*keyboardDismissalStartedAtRef\.current = null/,
  );
  assert.match(
    ui,
    /if \(!keyboardOpen\) \{[\s\S]*keyboardWasOpenRef\.current = false;[\s\S]*return;/,
    "ordinary closed viewport changes stay in native flow without a fixed-layout commit",
  );
});

test("mobile Clarity owns a zero document baseline around keyboard use", () => {
  assert.match(
    ui,
    /documentBaselineNormalizedRef\.current = true;[\s\S]*window\.scrollTo\(0, 0\)/,
  );
  assert.match(
    ui,
    /preComposerDocumentScrollRef\.current = \{[\s\S]*left: 0,[\s\S]*top: 0/,
  );
  assert.equal((ui.match(/window\.scrollTo\(/g) ?? []).length, 2);
  assert.match(
    ui,
    /window\.scrollTo\(savedScroll\.left, savedScroll\.top\)/,
  );
});

test("keyboard dismissal confirms state without taking panel geometry ownership", () => {
  const dismissalSource = ui.slice(
    ui.indexOf("const beginKeyboardDismissal"),
    ui.indexOf("const updateConversationViewport"),
  );
  assert.doesNotMatch(
    dismissalSource,
    /conversationScrollRef\.current[^;]*scrollTop|\.scrollTop\s*=/,
    "keyboard confirmation never writes history position",
  );
  assert.match(
    ui,
    /nonKeyboardComposerActive \|\|[\s\S]*keyboardLayout\.phase !== "closing"[\s\S]*composerFocused \|\| keyboardLayout\.phase === "open"/,
    "surrounding chrome starts returning with the closing phase",
  );
  assert.match(
    ui,
    /if \(keyboardPhase === "closing"\) \{[\s\S]*beginKeyboardDismissal\(\);[\s\S]*return;[\s\S]*const keyboardOpen/,
  );
  assert.equal(CLARITY_KEYBOARD_DISMISS_SETTLE_MS, 120);
  assert.match(
    dismissalSource,
    /clearTimeout\(keyboardDismissalSettleTimerRef\.current\)[\s\S]*cancelAnimationFrame/,
    "each closing viewport event restarts the bounded settle window",
  );
  assert.match(
    dismissalSource,
    /resolveClarityKeyboardDismissalDelay\([\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*scheduleFrame\(\(\) => \{[\s\S]*settleDelay/,
    "closed-frame confirmation begins only after viewport resize pulses settle",
  );
  assert.match(
    dismissalSource,
    /setKeyboardLayout\(\{ bottomOffset: null, phase: "closed" \}\)/,
    "internal confirmation only finalizes keyboard interaction state",
  );
  assert.doesNotMatch(ui, /keyboardDismissalTargetRef|restingHeight|restingTop/);
  assert.match(
    dismissalSource,
    /scheduleFrame\(\(\) => \{\s*if \(viewportStillShowsKeyboard\(\)\)[\s\S]*scheduleFrame\(\(\) => \{\s*if \(viewportStillShowsKeyboard\(\)\)/,
    "dismissal still requires two consecutive closed-looking animation frames",
  );
  const closedFrameChecks = [
    ...dismissalSource.matchAll(/if \(viewportStillShowsKeyboard\(\)\)/g),
  ];
  const dismissalCommitIndex = dismissalSource.lastIndexOf("setKeyboardLayout");
  assert.ok(closedFrameChecks.length >= 2);
  assert.ok((closedFrameChecks[1]?.index ?? Infinity) < dismissalCommitIndex);
  assert.match(
    dismissalSource.slice(closedFrameChecks[1]?.index, dismissalCommitIndex),
    /abandonDismissal\(\);\s*return;/,
    "one transient closed-looking frame is abandoned if the next frame reopens",
  );
});

test("the composer keeps one fixed mobile owner while its bottom boundary changes", () => {
  assert.match(
    ui,
    /data-clarity-composer-dock[\s\S]*max-md:fixed max-md:z-50/,
  );
  assert.match(
    ui,
    /keyboardLayout\.bottomOffset === null[\s\S]*var\(--clarity-app-bottom-boundary\)[\s\S]*keyboardLayout\.bottomOffset}px/,
    "closed uses the shared app boundary and open uses the measured keyboard boundary",
  );
  assert.doesNotMatch(ui, /fixedKeyboardPanel|resolveClarityClosedFlowTarget/);
});

test("bottom navigation stays mounted while editor visibility changes", () => {
  assert.match(appShell, /const editorNavigationHidden = activeEditorIds\.size > 0/);
  assert.match(appShell, /\{!hideBottomNavigation && \([\s\S]*<BottomNavigation[\s\S]*hidden=\{editorNavigationHidden\}/);
  assert.doesNotMatch(appShell, /\{!editorNavigationHidden &&/);
  assert.match(
    bottomNavigation,
    /aria-hidden=\{hidden \|\| undefined\}[\s\S]*inert=\{hidden \|\| undefined\}/,
  );
  assert.match(
    bottomNavigation,
    /transition-\[opacity,transform\][\s\S]*\[transition-duration:180ms\][\s\S]*pointer-events-none translate-y-2 opacity-0/,
  );
  assert.match(
    appShell,
    /"--clarity-app-bottom-boundary": hideBottomNavigation[\s\S]*max\(1\.5rem, env\(safe-area-inset-bottom\)\)[\s\S]*calc\(6\.5rem \+ env\(safe-area-inset-bottom\)\)[\s\S]*pb-\[var\(--clarity-app-bottom-boundary\)\]/,
    "editor visibility does not change the main navigation reservation",
  );
});

test("history inset is exactly the persistent dock overlap without nav double counting", () => {
  assert.equal(
    clarityHistoryBottomInset({ historyBottom: 700, composerDockTop: 610 }),
    90,
  );
  assert.equal(
    clarityHistoryBottomInset({ historyBottom: 700, composerDockTop: 720 }),
    0,
  );
  assert.match(
    ui,
    /clarityHistoryBottomInset\(\{[\s\S]*composerDock\.getBoundingClientRect\(\)\.top[\s\S]*history\.getBoundingClientRect\(\)\.bottom/,
  );
  assert.match(ui, /observer\.observe\(composerDock\)/);
  assert.match(ui, /data-clarity-history-bottom-inset/);
  assert.doesNotMatch(
    ui,
    /const nextInset = mobile[\s\S]*: 0/,
    "desktop reserves the same measured visual overlap instead of forcing its inset to zero",
  );
  assert.match(
    ui,
    /const nextInset = clarityHistoryBottomInset\(\{[\s\S]*composerDockTop: composerDock\.getBoundingClientRect\(\)\.top[\s\S]*historyBottom: history\.getBoundingClientRect\(\)\.bottom/,
    "the actual dock and history rectangles determine the legal bottom on every viewport",
  );
  assert.match(
    ui,
    /const keepLatestVisible =[\s\S]*historyNearBottomRef\.current;[\s\S]*if \(inset\.style\.height !== nextHeight\) \{[\s\S]*inset\.style\.height = nextHeight;[\s\S]*\}[\s\S]*if \(keepLatestVisible\) \{[\s\S]*history\.scrollTop = clarityConversationBottom/,
    "a live geometry change keeps the latest message visible even when the overlap height itself is unchanged",
  );
  assert.match(
    ui,
    /const updateConversationViewport = useCallback\(\(\) => \{[\s\S]*syncHistoryBottomInset\(\);[\s\S]*const visualViewport = window\.visualViewport/,
    "viewport geometry synchronously reconciles dock overlap before the observer fallback",
  );
  assert.doesNotMatch(ui, /historyBottomInset[\s\S]*6\.5rem/);
});

test("only explicit send and jump actions request a later latest-message position", () => {
  assert.match(ui, /scrollAfterSendMessageCountRef\.current = messages\.length/);
  assert.match(ui, /messages\.length > sentFromCount/);
  assert.match(ui, /scrollAfterSendMessageCountRef\.current = null/);
  assert.match(
    ui,
    /function jumpToLatest\(\) \{\s*scrollConversationToBottom\(\);\s*\}/,
  );
});

test("normal history scrolling stays native outside keyboard dismissal", () => {
  assert.doesNotMatch(ui, /followLatest|initialSettling/);
  assert.doesNotMatch(ui, /onWheel=|onPointerDown=|onTouchStart=/);
  assert.match(ui, /onScroll=\{handleHistoryScroll\}/);
  assert.match(
    ui,
    /function handleHistoryScroll\(\)[\s\S]*const nearBottom = isClarityHistoryNearBottom[\s\S]*setShowJumpToLatest\(!nearBottom\)/,
    "native scroll events only update whether the explicit jump affordance is visible",
  );
  assert.doesNotMatch(ui, /document\.addEventListener\(["']touch/);
  assert.doesNotMatch(ui, /window\.addEventListener\(["']touch/);
  assert.match(
    ui,
    /sentFromCount !== null && messages\.length > sentFromCount[\s\S]*scrollConversationToBottom\(\)/,
    "the only later bottom write follows an explicit successful send",
  );
  assert.match(
    ui,
    /if \(measurement\.ready\) \{[\s\S]*disconnect\(\);[\s\S]*setInitialHistoryReady\(true\)/,
    "the initialization observer cannot become a long-lived scroll controller",
  );
  assert.doesNotMatch(ui, /history\.scrollTop\s*[+\-]=/);
  assert.match(
    ui,
    /data-clarity-conversation-scroll[\s\S]*touch-pan-y[\s\S]*overflow-y-auto[\s\S]*overscroll-y-none[\s\S]*\[-webkit-overflow-scrolling:touch\]/,
  );
  assert.doesNotMatch(ui, /onLoad=.*scroll|onLoadedMetadata=.*scroll/);
});

test("a history drag dismisses an open keyboard without manual scroll physics", () => {
  const decision = resolveClarityHistoryGesture({
    keyboardOpenAtStart: true,
    textareaFocusedAtStart: true,
    startX: 20,
    startY: 100,
    currentX: 20,
    currentY: 90,
  });
  const event = new Event("touchmove", { cancelable: true });

  assert.deepEqual(decision, {
    contain: true,
    deltaX: 0,
    deltaY: -10,
    thresholdExceeded: true,
    verticalDominant: true,
    blurTextarea: true,
  });
  assert.equal(preventClarityHistoryGestureDefault(event, decision.contain), true);
  assert.equal(event.defaultPrevented, true);
  assert.match(ui, /if \(blurRequested && !touch\.blurRequested\) textarea\.blur\(\)/);
  const historyGestureSource = ui.slice(
    ui.indexOf("const handleHistoryTouchStart"),
    ui.indexOf("useLayoutEffect(() => {\n    if (initialPositionedRef.current)"),
  );
  assert.doesNotMatch(historyGestureSource, /history\.scrollTop\s*[+\-]?=/);
});

test("history gestures remain native when the keyboard is closed", () => {
  const decision = resolveClarityHistoryGesture({
    keyboardOpenAtStart: false,
    textareaFocusedAtStart: false,
    startX: 20,
    startY: 100,
    currentX: 20,
    currentY: 80,
  });
  const event = new Event("touchmove", { cancelable: true });

  assert.equal(decision.contain, false);
  assert.equal(decision.blurTextarea, false);
  assert.equal(preventClarityHistoryGestureDefault(event, decision.contain), false);
  assert.equal(event.defaultPrevented, false);
});

test("history touch state clears on end and cancel without global blockers", () => {
  assert.match(ui, /history\.addEventListener\("touchend", handleHistoryTouchEnd/);
  assert.match(ui, /history\.addEventListener\("touchcancel", handleHistoryTouchEnd/);
  assert.match(ui, /historyTouchRef\.current = null/);
  assert.match(
    ui,
    /history\.removeEventListener\("touchcancel", handleHistoryTouchEnd, true\)/,
  );
});

test("the whole canvas above the composer has one history gesture owner", () => {
  assert.doesNotMatch(ui, /data-clarity-history-composer-gap/);
  assert.doesNotMatch(ui, /historyComposerGapRef|gestureTargets/);
  assert.match(
    ui,
    /data-clarity-conversation-scroll[\s\S]*data-clarity-history-content[\s\S]*space-y-3 pb-3[\s\S]*data-clarity-history-bottom-inset/,
  );
  assert.match(ui, /history\.addEventListener\("touchstart"/);
  assert.match(ui, /data-clarity-composer-scrim/);
  assert.doesNotMatch(ui, /historyComposerGap|history-composer-gap/);
});

test("keyboard layout preserves composer growth, photos, dictation, and nav integration", () => {
  assert.match(ui, /window\.visualViewport/);
  assert.match(ui, /visualViewport\?\.offsetTop/);
  assert.match(ui, /useAppShellEditorState\(mobileComposerActive\)/);
  assert.match(ui, /CLARITY_COMPOSER_MAX_HEIGHT_PX/);
  assert.match(ui, /draftMedia\.length/);
  assert.match(ui, /dictationStatus/);
  assert.match(ui, /shrink-0/);
});

test("keyboard changes resize geometry without moving conversation history", () => {
  assert.doesNotMatch(ui, /scrollIntoView/);
  assert.match(ui, /viewport\?\.addEventListener\("resize", update\)/);
  assert.match(ui, /viewport\?\.addEventListener\("scroll", update\)/);
  assert.match(ui, /setKeyboardLayout/);
  assert.doesNotMatch(ui, /setViewportLayout|fixedKeyboardPanel/);
  const viewportSource = ui.slice(
    ui.indexOf("const updateConversationViewport"),
    ui.indexOf('useLayoutEffect(() => {\n    const query = window.matchMedia'),
  );
  assert.doesNotMatch(viewportSource, /conversationScrollRef[\s\S]*scrollTop\s*=/);
});

test("the composer dock is a persistent sibling of the scrollable history", () => {
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /min-h-0 min-w-0 flex-1[^"]*overflow-y-auto/);
  assert.match(
    ui,
    /data-clarity-conversation-scroll[\s\S]*data-clarity-composer-dock[\s\S]*data-clarity-composer-scrim[\s\S]*pointer-events-none[\s\S]*bg-gradient-to-b from-transparent via-background to-background opacity-90/,
  );
  assert.doesNotMatch(
    ui,
    /data-clarity-composer-dock[\s\S]{0,600}\bh-10\b/,
  );
  assert.doesNotMatch(
    ui,
    /data-clarity-composer-dock[\s\S]{0,600}\bborder-t\b/,
  );
  assert.match(
    ui,
    /data-clarity-composer-shell[\s\S]*bg-card[\s\S]*backdrop-blur-md[\s\S]*color-mix\(in srgb, var\(--card\) 95%, transparent\)/,
  );
  assert.doesNotMatch(ui, /data-clarity-conversation-panel[\s\S]{0,300}\bfixed\b/);
});

test("jump to latest is an explicit non-sticky affordance", () => {
  assert.match(ui, /data-clarity-jump-to-latest/);
  assert.match(ui, /aria-label="Jump to latest"/);
  assert.match(ui, /showJumpToLatest &&/);
  assert.match(ui, /onClick=\{jumpToLatest\}/);
  assert.match(
    ui,
    /function handleHistoryScroll\(\)[\s\S]*const nearBottom = isClarityHistoryNearBottom[\s\S]*setShowJumpToLatest\(!nearBottom\)/,
  );
  assert.match(
    ui,
    /const scrollConversationToBottom = useCallback\([\s\S]*scroll\.scrollTop = expectedBottom;[\s\S]*setShowJumpToLatest\(false\)/,
  );
  assert.doesNotMatch(ui, /followLatest|setAutoFollow|autoFollow/);
});

test("mobile chat has one page-independent history scroll owner", () => {
  assert.match(ui, /root\.style\.overflow = "hidden"/);
  assert.match(ui, /body\.style\.overflow = "hidden"/);
  assert.doesNotMatch(ui, /body\.style\.position|body\.style\.top/);
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /flex-1[^"]*overflow-y-auto/);
  assert.match(
    ui,
    /max-md:-mb-\[var\(--clarity-app-bottom-boundary\)\]/,
    "the history owner consumes the reserved mobile shell boundary behind fixed controls",
  );
});

test("the long textarea contains native internal scrolling without page chaining", () => {
  assert.match(ui, /textarea\.style\.overflowY = next\.scrolls \? "auto" : "hidden"/);
  assert.match(
    ui,
    /<textarea[\s\S]*touch-pan-y[\s\S]*overscroll-y-contain[\s\S]*disabled=/,
  );
  assert.doesNotMatch(
    ui,
    /<textarea[\s\S]*\[-webkit-overflow-scrolling:touch\][\s\S]*disabled=/,
  );
  assert.match(ui, /composer\.addEventListener\("touchstart", handleTouchStart/);
  assert.match(
    ui,
    /composer\.addEventListener\("touchmove", handleTouchMove, \{[\s\S]*passive: false,[\s\S]*capture: true/,
  );
  assert.match(
    ui,
    /composer\.removeEventListener\("touchmove", handleTouchMove, true\)/,
  );
  assert.doesNotMatch(ui, /window\.addEventListener\("touchmove"/);
  const touchContainment = ui.slice(
    ui.indexOf("const handleTouchMove = (event: TouchEvent) =>"),
    ui.indexOf("const handleHistoryTouchStart = (event: TouchEvent) =>"),
  );
  assert.doesNotMatch(touchContainment, /textarea\.scrollTop\s*=/);
  assert.doesNotMatch(ui, /pointermove/i);
});

test("composer gesture state is temporary and identifier-scoped", () => {
  assert.match(ui, /const composerTouchRef = useRef</);
  assert.match(ui, /identifier: point\.identifier/);
  assert.match(ui, /findTouch\(event\.touches, touch\.identifier\)/);
  assert.match(ui, /findTouch\(event\.changedTouches, touch\.identifier\)/);
  assert.match(
    ui,
    /composer\.addEventListener\("touchcancel", handleTouchEnd/,
  );
  assert.match(
    ui,
    /composer\.removeEventListener\("touchcancel", handleTouchEnd, true\)/,
  );
  assert.match(
    ui,
    /composer\.removeEventListener\("touchstart", handleTouchStart, true\);[\s\S]*resetTouch\(\)/,
  );
  assert.equal(
    (ui.match(/window\.addEventListener\("touchmove"/g) ?? []).length,
    0,
  );
  assert.match(ui, /composerTouchRef\.current = null/);
});

test("focused composer shell owns vertical drags but leaves taps native", () => {
  assert.match(
    ui,
    /const startsInTextarea = event\.composedPath\(\)\.includes\(textarea\)/,
  );
  assert.match(
    ui,
    /composer\.contains\(document\.activeElement\)[\s\S]*keyboardWasOpenRef\.current[\s\S]*composerEditorActiveRef\.current/,
  );
  assert.match(ui, /origin: startsInTextarea \? "textarea" : "composer"/);
  assert.match(
    ui,
    /composer\.addEventListener\("touchmove", handleTouchMove, \{[\s\S]*passive: false,[\s\S]*capture: true/,
  );
  assert.match(
    ui,
    /const containmentActive = touch\.containmentActive \|\| decision\.contain[\s\S]*preventClarityComposerTouchDefault\([\s\S]*event,[\s\S]*containmentActive/,
  );
  assert.match(
    ui,
    /touch\.keyboardOpenAtStart &&[\s\S]*containmentActive &&[\s\S]*document\.activeElement === textarea[\s\S]*if \(blurRequested && !touch\.blurRequested\) textarea\.blur\(\)/,
    "a deliberate contained composer drag uses the existing blur dismissal path only while keyboard-open",
  );
  assert.doesNotMatch(
    ui,
    /conversationScrollRef[\s\S]{0,80}addEventListener\("touchstart"/,
  );
});

test("composer keeps a complete high-opacity bordered shell while focused", () => {
  assert.match(
    ui,
    /data-clarity-composer-shell[\s\S]*className="relative min-w-0 rounded-2xl border border-border bg-card p-2 shadow-md backdrop-blur-md"[\s\S]*color-mix\(in srgb, var\(--card\) 95%, transparent\)/,
  );
  assert.doesNotMatch(ui, /focus-within:bg-[^\s"]+\/\d+/);
  assert.doesNotMatch(ui, /focus-within:border-[^\s"]+\/\d+/);
});
