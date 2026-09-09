import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isClarityKeyboardOpen,
  resolveClarityConversationViewport,
} from "./clarity-chat-layout.ts";

const ui = readFileSync(
  new URL("../../../components/clarity/clarity-conversation.tsx", import.meta.url),
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
      composerFocused: true,
    }),
    true,
  );
  assert.equal(
    isClarityKeyboardOpen({
      baselineHeight: 780,
      visibleHeight: 730,
      composerFocused: true,
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

test("normal history scrolling has no JavaScript follow or gesture machinery", () => {
  assert.doesNotMatch(ui, /ResizeObserver/);
  assert.doesNotMatch(ui, /followLatest|nearBottom|initialSettling/);
  assert.doesNotMatch(ui, /onScroll=|onWheel=|onPointerDown=|onTouchStart=/);
  assert.doesNotMatch(
    ui,
    /conversationScrollRef\.current\?\.addEventListener\(["']touch/,
  );
  assert.doesNotMatch(ui, /document\.addEventListener\(["']touch/);
  assert.doesNotMatch(ui, /onLoad=.*scroll|onLoadedMetadata=.*scroll/);
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
    /className="min-w-0 shrink-0 space-y-2 bg-background\/95 pt-2 backdrop-blur"/,
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
  assert.match(ui, /textarea\.addEventListener\("touchstart", handleTouchStart/);
  assert.match(
    ui,
    /window\.addEventListener\("touchmove", handleTouchMove, \{ passive: false \}\)/,
  );
  assert.match(
    ui,
    /window\.removeEventListener\("touchmove", handleTouchMove\)/,
  );
  assert.doesNotMatch(ui, /textarea\.scrollTop\s*=/);
  assert.doesNotMatch(ui, /pointermove/i);
});

test("composer-started touch ownership is temporary and identifier-scoped", () => {
  assert.match(ui, /identifier: point\.identifier/);
  assert.match(ui, /findTouch\(event\.touches, touch\.identifier\)/);
  assert.match(ui, /findTouch\(event\.changedTouches, touch\.identifier\)/);
  assert.match(
    ui,
    /window\.addEventListener\("touchcancel", handleTouchEnd/,
  );
  assert.match(
    ui,
    /window\.removeEventListener\("touchcancel", handleTouchEnd\)/,
  );
  assert.match(
    ui,
    /textarea\.removeEventListener\("touchstart", handleTouchStart\);[\s\S]*resetTouch\(\)/,
  );
  assert.equal(
    (ui.match(/window\.addEventListener\("touchmove"/g) ?? []).length,
    1,
  );
});

test("composer focus treatment changes paint without changing geometry", () => {
  assert.match(ui, /focus-within:border-primary\/40/);
  assert.match(ui, /focus-within:bg-secondary\/20/);
  assert.match(ui, /focus-within:ring-1 focus-within:ring-primary\/10/);
  assert.match(ui, /transition-\[border-color,background-color,box-shadow\]/);
  assert.doesNotMatch(ui, /focus-within:(?:p-|m-|h-|min-h-|max-h-|border-[0248])/);
});
