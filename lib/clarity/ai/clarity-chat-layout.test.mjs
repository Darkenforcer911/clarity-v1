import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLARITY_NEAR_BOTTOM_PX,
  isClarityConversationNearBottom,
  isClarityKeyboardOpen,
  resolveClarityConversationViewport,
} from "./clarity-chat-layout.ts";

const ui = readFileSync(
  new URL("../../../components/clarity/clarity-conversation.tsx", import.meta.url),
  "utf8",
);

test("a long conversation opens at the latest rendered message", () => {
  assert.match(ui, /useLayoutEffect\([\s\S]*initialPositionedRef/);
  assert.match(ui, /scrollConversationToBottom/);
  assert.match(ui, /data-clarity-conversation-scroll/);
  assert.match(ui, /overflow-y-auto/);
});

test("near-bottom detection follows new turns without yanking older reading", () => {
  assert.equal(CLARITY_NEAR_BOTTOM_PX, 96);
  assert.equal(
    isClarityConversationNearBottom({
      scrollHeight: 2_000,
      scrollTop: 1_320,
      clientHeight: 600,
    }),
    true,
  );
  assert.equal(
    isClarityConversationNearBottom({
      scrollHeight: 2_000,
      scrollTop: 900,
      clientHeight: 600,
    }),
    false,
  );
  assert.match(ui, /followLatestRef\.current = isClarityConversationNearBottom/);
  assert.match(ui, /if \(followLatestRef\.current\)/);
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

test("composer and media height changes preserve auto-follow only near the bottom", () => {
  assert.match(ui, /new ResizeObserver/);
  assert.match(ui, /messageContentRef\.current/);
  assert.match(ui, /composerFormRef\.current/);
  assert.match(ui, /onLoad=\{onMediaSettled\}/);
  assert.match(ui, /onLoadedMetadata=\{onMediaSettled\}/);
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

test("keyboard focus uses a bounded visibility correction without moving conversation history", () => {
  assert.match(ui, /composer\.scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.doesNotMatch(ui, /conversationScrollRef\.current\?\.scrollIntoView/);
  assert.match(ui, /viewport\?\.addEventListener\("resize", update\)/);
  assert.match(ui, /viewport\?\.addEventListener\("scroll", update\)/);
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
