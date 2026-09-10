import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLARITY_KEYBOARD_CLOSE_THRESHOLD_PX,
  CLARITY_KEYBOARD_CLOSE_TRANSITION_MS,
  CLARITY_KEYBOARD_DISMISS_FALLBACK_MS,
  CLARITY_KEYBOARD_DISMISS_SETTLE_MS,
  CLARITY_KEYBOARD_THRESHOLD_PX,
  CLARITY_VIEWPORT_RESTING_HEIGHT_TOLERANCE_PX,
  CLARITY_VIEWPORT_RESTING_OFFSET_TOLERANCE_PX,
  isClarityKeyboardOpen,
  isClarityViewportNearResting,
  resolveClarityKeyboardDismissalDelay,
  resolveClarityKeyboardPhase,
  resolveClarityConversationViewport,
} from "./clarity-chat-layout.ts";
import {
  preventClarityHistoryGestureDefault,
  resolveClarityHistoryGesture,
} from "./clarity-history-gesture.ts";
import {
  CLARITY_LAYOUT_DEBUG_ACTIVATION_TAPS,
  isClarityStandaloneRuntime,
  recordClarityLayoutDebugTap,
  shouldEnableClarityLayoutDebug,
} from "./clarity-layout-debug-mode.ts";

const ui = readFileSync(
  new URL("../../../components/clarity/clarity-conversation.tsx", import.meta.url),
  "utf8",
);
const debugUi = readFileSync(
  new URL("../../../components/clarity/clarity-layout-debug.tsx", import.meta.url),
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

test("a long conversation gets one initial latest-message position", () => {
  assert.match(ui, /useLayoutEffect\([\s\S]*initialPositionedRef/);
  assert.match(
    ui,
    /if \(!initialPositionedRef\.current\)[\s\S]*scrollConversationToBottom\(\);[\s\S]*return;/,
  );
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /overflow-y-auto/);
  assert.doesNotMatch(ui, /requestAnimationFrame\(scrollConversationToBottom/);
});

test("mobile route entry reveals only the final measured closed geometry", () => {
  assert.match(
    ui,
    /const \[initialMobileLayoutReady, setInitialMobileLayoutReady\][\s\S]*useState\(false\)/,
  );
  assert.match(
    ui,
    /finalFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]*updateConversationViewport\(\);[\s\S]*setInitialMobileLayoutReady\(true\)/,
    "the final existing mount measurement owns the first visible mobile frame",
  );
  assert.match(
    ui,
    /initialMobileLayoutReady \? "" : "max-md:invisible"/,
    "provisional server and hydration geometry is not painted on mobile",
  );
  assert.match(
    ui,
    /const navigationTop = keyboardOpen \|\| nonKeyboardComposerActive[\s\S]*navigation\?\.getBoundingClientRect\(\)\.top/,
    "focus alone keeps canonical closed navigation-bounded geometry",
  );
});

test("the visual viewport creates a keyboard-sized chat region", () => {
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
  assert.deepEqual(
    resolveClarityConversationViewport({
      visibleHeight: 430,
      visibleOffsetTop: 40,
      hostTop: 170,
      headerBottom: 96,
      navigationTop: null,
      keyboardOpen: true,
    }),
    { top: 96, height: 374 },
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
  assert.deepEqual(
    resolveClarityConversationViewport({
      visibleHeight: 417,
      visibleOffsetTop: 358,
      hostTop: -185,
      headerBottom: -16,
      navigationTop: null,
      keyboardOpen: true,
    }),
    { top: 358, height: 417 },
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
  assert.match(ui, /const phase = keyboardOpen \? "open" : "closed"/);
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

test("keyboard dismissal owns one visual transition before normal geometry", () => {
  const dismissalSource = ui.slice(
    ui.indexOf("const beginKeyboardDismissal"),
    ui.indexOf("const updateConversationViewport"),
  );
  assert.match(
    dismissalSource,
    /height: current\.restingHeight \?\? current\.height,[\s\S]*phase: "closing",[\s\S]*top: current\.restingTop \?\? current\.top/,
    "closing targets only the recorded resting geometry",
  );
  assert.match(
    dismissalSource,
    /if \(current\.phase === "closing"\) return current/,
    "late viewport pulses cannot retarget a closing panel",
  );
  assert.doesNotMatch(
    dismissalSource,
    /conversationScrollRef\.current[^;]*scrollTop|\.scrollTop\s*=/,
    "the visual transition never writes history position",
  );
  assert.match(
    ui,
    /nonKeyboardComposerActive \|\|[\s\S]*viewportLayout\.phase !== "closing"[\s\S]*composerFocused \|\| viewportLayout\.phase === "open"/,
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
    /Confirmation changes state only; closing already owns the geometry\.[\s\S]*height: current\.restingHeight \?\? current\.height,[\s\S]*phase: "closed",[\s\S]*top: current\.restingTop \?\? current\.top/,
    "internal confirmation cannot retarget visible geometry",
  );
  assert.match(
    ui,
    /viewportLayout\.phase === "closing"[\s\S]*top \$\{CLARITY_KEYBOARD_CLOSE_TRANSITION_MS\}ms ease-out, height \$\{CLARITY_KEYBOARD_CLOSE_TRANSITION_MS\}ms ease-out/,
  );
  assert.equal(CLARITY_KEYBOARD_CLOSE_TRANSITION_MS, 180);
  assert.match(
    ui,
    /scheduleFrame\(\(\) => \{[\s\S]*scheduleFrame\(measureSettledNormalViewport\)/,
  );
  assert.match(
    dismissalSource,
    /scheduleFrame\(\(\) => \{\s*if \(viewportStillShowsKeyboard\(\)\)[\s\S]*scheduleFrame\(\(\) => \{\s*if \(viewportStillShowsKeyboard\(\)\)/,
    "dismissal still requires two consecutive closed-looking animation frames",
  );
  const closedFrameChecks = [
    ...dismissalSource.matchAll(/if \(viewportStillShowsKeyboard\(\)\)/g),
  ];
  const dismissalCommitIndex = dismissalSource.lastIndexOf("setViewportLayout");
  assert.ok(closedFrameChecks.length >= 2);
  assert.ok((closedFrameChecks[1]?.index ?? Infinity) < dismissalCommitIndex);
  assert.match(
    dismissalSource.slice(closedFrameChecks[1]?.index, dismissalCommitIndex),
    /abandonDismissal\(\);\s*return;/,
    "one transient closed-looking frame is abandoned if the next frame reopens",
  );
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
    /hideBottomNavigation[\s\S]*pb-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\][\s\S]*pb-\[calc\(6\.5rem\+env\(safe-area-inset-bottom\)\)\]/,
    "editor visibility does not change the main navigation reservation",
  );
});

test("keyboard close restores the navigation-bounded layout without accumulating offsets", () => {
  const input = {
    visibleHeight: 780,
    visibleOffsetTop: 0,
    hostTop: 170,
    headerBottom: 56,
    navigationTop: 700,
    keyboardOpen: false,
  };
  const first = resolveClarityConversationViewport(input);
  const repeated = resolveClarityConversationViewport(input);
  assert.deepEqual(first, { top: 170, height: 522 });
  assert.deepEqual(repeated, first);
  assert.match(ui, /nav\[aria-label="Primary"\]/);
  assert.match(ui, /pb-\[env\(safe-area-inset-bottom\)\]/);
});

test("only a user send schedules one subsequent latest-message position", () => {
  assert.match(ui, /scrollAfterSendMessageCountRef\.current = messages\.length/);
  assert.match(ui, /messages\.length > sentFromCount/);
  assert.match(ui, /scrollAfterSendMessageCountRef\.current = null/);
});

test("normal history scrolling stays native outside keyboard dismissal", () => {
  assert.doesNotMatch(ui, /ResizeObserver/);
  assert.doesNotMatch(ui, /followLatest|nearBottom|initialSettling/);
  assert.doesNotMatch(ui, /onScroll=|onWheel=|onPointerDown=|onTouchStart=/);
  assert.doesNotMatch(ui, /document\.addEventListener\(["']touch/);
  assert.doesNotMatch(ui, /window\.addEventListener\(["']touch/);
  assert.doesNotMatch(ui, /history\.scrollTop\s*=/);
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
  assert.doesNotMatch(ui, /history\.scrollTop\s*[+\-]?=/);
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
  assert.match(ui, /const gestureTargets = \[history, historyComposerGap\]/);
  assert.match(ui, /target\.addEventListener\("touchend", handleHistoryTouchEnd/);
  assert.match(ui, /target\.addEventListener\("touchcancel", handleHistoryTouchEnd/);
  assert.match(ui, /historyTouchRef\.current = null/);
  assert.match(
    ui,
    /target\.removeEventListener\("touchcancel", handleHistoryTouchEnd, true\)/,
  );
});

test("the history-composer gap shares keyboard-open history gesture ownership", () => {
  assert.match(ui, /data-clarity-history-composer-gap/);
  assert.match(ui, /className="h-6 min-h-6 shrink-0 touch-pan-y"/);
  assert.match(ui, /const gestureTargets = \[history, historyComposerGap\]/);
  assert.doesNotMatch(
    ui,
    /data-clarity-conversation-panel[\s\S]{0,400}flex-col gap-4/,
  );
  assert.doesNotMatch(
    ui,
    /min-w-0 shrink-0 space-y-2 bg-background\/95 pt-2/,
  );
  assert.match(debugUi, /historyComposerGap: "\[data-clarity-history-composer-gap\]"/);
  assert.match(debugUi, /return "history-composer-gap"/);
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
  assert.doesNotMatch(
    ui,
    /\[scrollConversationToBottom, viewportLayout\.height\]/,
  );
  assert.match(ui, /mobilePanelReady[\s\S]*fixed/);
});

test("the composer is a non-overlapping sibling of the scrollable history", () => {
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /min-h-0 min-w-0 flex-1[^"]*overflow-y-auto/);
  assert.match(
    ui,
    /data-clarity-history-composer-gap[\s\S]*className="min-w-0 shrink-0 space-y-2 bg-background\/95 backdrop-blur"/,
  );
  assert.doesNotMatch(ui, /className=\{`sticky min-w-0/);
});

test("mobile chat has one page-independent history scroll owner", () => {
  assert.match(ui, /root\.style\.overflow = "hidden"/);
  assert.match(ui, /body\.style\.overflow = "hidden"/);
  assert.doesNotMatch(ui, /body\.style\.position|body\.style\.top/);
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /flex-1[^"]*overflow-y-auto/);
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
    /preventClarityComposerTouchDefault\([\s\S]*event,[\s\S]*decision\.contain/,
  );
  assert.doesNotMatch(
    ui,
    /conversationScrollRef[\s\S]{0,80}addEventListener\("touchstart"/,
  );
});

test("composer focus treatment changes paint without changing geometry", () => {
  assert.match(ui, /focus-within:border-primary\/40/);
  assert.match(ui, /focus-within:bg-secondary\/20/);
  assert.match(ui, /focus-within:ring-1 focus-within:ring-primary\/10/);
  assert.match(ui, /transition-\[border-color,background-color,box-shadow\]/);
  assert.doesNotMatch(ui, /focus-within:(?:p-|m-|h-|min-h-|max-h-|border-[0248])/);
});

test("layout diagnostics are gated by the exact layoutDebug query value", () => {
  assert.match(clarityPage, /layoutDebugValue\.includes\("1"\)/);
  assert.match(clarityPage, /layoutDebugValue === "1"/);
  assert.match(clarityPage, /layoutDebug=\{layoutDebug\}/);
  assert.match(ui, /layoutDebugActive && \(/);
  assert.match(ui, /<ClarityLayoutDebug onDisable=\{disableLayoutDebug\}/);
  assert.doesNotMatch(debugUi, /useSearchParams|location\.search/);
});

test("standalone layout diagnostics use isolated persistent activation", () => {
  assert.equal(
    isClarityStandaloneRuntime({
      displayModeStandalone: true,
      navigatorStandalone: false,
    }),
    true,
  );
  assert.equal(
    shouldEnableClarityLayoutDebug({
      queryEnabled: false,
      standalone: true,
      persistedValue: "1",
    }),
    true,
  );
  assert.equal(
    shouldEnableClarityLayoutDebug({
      queryEnabled: false,
      standalone: false,
      persistedValue: "1",
    }),
    false,
  );
  assert.match(ui, /window\.matchMedia\("\(display-mode: standalone\)"\)/);
  assert.match(ui, /window\.navigator[\s\S]*standalone/);
  assert.match(ui, /CLARITY_LAYOUT_DEBUG_STORAGE_KEY/);
  assert.match(ui, /"\[data-clarity-page-title\]"/);
  assert.match(debugUi, /Disable debug/);
});

test("standalone debug activation requires seven quick title taps", () => {
  let timestamps = [];
  for (
    let index = 0;
    index < CLARITY_LAYOUT_DEBUG_ACTIVATION_TAPS - 1;
    index += 1
  ) {
    const result = recordClarityLayoutDebugTap(timestamps, index * 250);
    assert.equal(result.activate, false);
    timestamps = result.timestamps;
  }
  const activated = recordClarityLayoutDebugTap(timestamps, 1_500);
  assert.equal(activated.activate, true);
  assert.deepEqual(activated.timestamps, []);

  const expired = recordClarityLayoutDebugTap([0, 100, 200], 5_000);
  assert.equal(expired.activate, false);
  assert.deepEqual(expired.timestamps, [5_000]);
});

test("layout diagnostics are bounded, in-memory, and capture required geometry", () => {
  assert.match(debugUi, /const MAX_TRACE_ENTRIES = 400/);
  assert.match(debugUi, /entriesRef = useRef<TraceEntry\[]>\(\[]\)/);
  assert.match(debugUi, /entriesRef\.current\.splice/);
  assert.match(debugUi, /window\.innerHeight/);
  assert.match(debugUi, /window\.scrollY/);
  assert.match(debugUi, /viewport\.offsetTop/);
  assert.match(debugUi, /viewport\.pageTop/);
  assert.match(debugUi, /document\.scrollingElement/);
  assert.match(debugUi, /getBoundingClientRect/);
  assert.match(debugUi, /safe-area-inset-top/);
  assert.match(debugUi, /history[\s\S]*scrollTop/);
  assert.match(debugUi, /textarea[\s\S]*scrollTop/);
  assert.match(debugUi, /dataset\.clarityKeyboardPhase/);
  assert.match(debugUi, /getAttribute\("aria-hidden"\) === "true"/);
  assert.match(debugUi, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(
    debugUi,
    /fetch\(|localStorage|sessionStorage|document\.cookie|textarea\.value|message\.value|activeElement\.value/,
  );
});

test("layout diagnostics observe composer gestures without changing their behavior", () => {
  assert.match(debugUi, /touchstart/);
  assert.match(debugUi, /touchmove/);
  assert.match(debugUi, /touchend/);
  assert.match(debugUi, /touchcancel/);
  assert.match(debugUi, /activeTouchIdentifier/);
  assert.match(debugUi, /event\.cancelable/);
  assert.match(debugUi, /event\.defaultPrevented/);
  assert.match(debugUi, /clarityComposerGuardInstalled/);
  for (const field of [
    "guardInvoked",
    "matchingTouchFound",
    "identifierMatched",
    "deltaX",
    "deltaY",
    "thresholdExceeded",
    "verticalDominant",
    "textareaScrollable",
    "textareaAtBoundary",
    "skipReason",
    "preventDefaultCalled",
    "defaultPreventedAfter",
  ]) {
    assert.match(ui, new RegExp(field));
  }
  assert.match(debugUi, /capture\("composer-guard", detail\)/);
  assert.match(ui, /CLARITY_COMPOSER_GUARD_DEBUG_EVENT/);
  assert.equal(
    (ui.match(/window\.addEventListener\("touchmove"/g) ?? []).length,
    0,
  );
  assert.doesNotMatch(debugUi, /stopPropagation\(/);
  assert.match(debugUi, /onMouseDownCapture[\s\S]*event\.preventDefault\(\)/);
});

test("layout diagnostics capture bounded history gesture metadata", () => {
  assert.match(debugUi, /CLARITY_HISTORY_GESTURE_DEBUG_EVENT/);
  assert.match(debugUi, /capture\("history-gesture"/);
  for (const field of [
    "keyboardOpenAtStart",
    "textareaFocusedAtStart",
    "historyScrollTopBefore",
    "historyScrollTopAfter",
    "historyScrollHeight",
    "historyClientHeight",
    "deltaX",
    "deltaY",
    "direction",
    "blurRequested",
    "documentScrollY",
    "visualViewportHeight",
    "visualViewportOffsetTop",
  ]) {
    assert.match(ui, new RegExp(field));
  }
});

test("the diagnostic HUD stays above app layout in the current visual viewport", () => {
  assert.match(debugUi, /createPortal\(/);
  assert.match(debugUi, /document\.body/);
  assert.match(debugUi, /z-\[2147483647\]/);
  assert.match(debugUi, /viewport\?\.offsetTop/);
  assert.match(debugUi, /viewport\?\.offsetLeft/);
  assert.match(debugUi, /viewport\?\.width/);
  assert.match(debugUi, /viewport\?\.addEventListener\("resize"/);
  assert.match(debugUi, /viewport\?\.addEventListener\("scroll"/);
  assert.match(debugUi, /textarea\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(debugUi, /<select|<input/);
  for (const label of [
    "A_fresh",
    "B_composer_focused",
    "C_first_good_drag",
    "D_second_jitter_drag",
    "E_after_keyboard_close",
    "F_header_overlap",
  ]) {
    assert.match(debugUi, new RegExp(label));
  }
});
