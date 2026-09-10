import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isClarityKeyboardOpen,
  resolveClarityKeyboardPhase,
  resolveClarityConversationViewport,
} from "./clarity-chat-layout.ts";
import {
  preventClarityHistoryGestureDefault,
  resolveClarityHistoryGesture,
} from "./clarity-history-gesture.ts";

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
      visibleHeight: 730,
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

test("keyboard dismissal restores document position once before normal geometry", () => {
  assert.match(
    ui,
    /current\.restingHeight \?\? availableHeight/,
  );
  assert.match(ui, /Math\.min\([\s\S]*current\.restingHeight/);
  assert.match(
    ui,
    /composerEditorActive \|\| viewportLayout\.keyboardOpen/,
  );
  assert.match(
    ui,
    /if \(keyboardPhase === "closing"\) \{[\s\S]*beginKeyboardDismissal\(\);[\s\S]*return;[\s\S]*const keyboardOpen/,
  );
  assert.match(
    ui,
    /scheduleFrame\(\(\) => \{[\s\S]*scheduleFrame\(measureSettledNormalViewport\)/,
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
  assert.match(ui, /touch-pan-y[\s\S]*overscroll-y-contain/);
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
  assert.doesNotMatch(ui, /textarea\.scrollTop\s*=/);
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
  assert.match(ui, /\{layoutDebug && <ClarityLayoutDebug \/>\}/);
  assert.doesNotMatch(debugUi, /useSearchParams|location\.search/);
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
