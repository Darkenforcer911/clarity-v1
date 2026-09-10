import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clarityTouchRegion, observeClarityTouches } from "./clarity-touch-diagnostics.ts";

class FakeElement {
  constructor(tagName, selectors = []) {
    this.tagName = tagName;
    this.selectors = selectors;
    this.textContent = "PRIVATE MESSAGE";
    this.id = "PRIVATE ID";
    this.value = "PRIVATE VALUE";
  }
  closest(selector) { return this.selectors.includes(selector) ? this : null; }
}
globalThis.Element = FakeElement;
const historySelector = "[data-clarity-conversation-scroll]";
const textareaSelector = 'textarea[name="message"]';
const shellSelector = "[data-clarity-composer-shell]";

function harness() {
  const listeners = new Map();
  const registrations = [];
  const history = { scrollTop: 200 };
  const records = [];
  const win = {
    scrollY: 0, innerHeight: 741,
    visualViewport: { height: 403, offsetTop: 338 },
    addEventListener(type, fn, options) { listeners.set(type, fn); registrations.push(options); },
    removeEventListener(type, fn, capture) {
      assert.equal(listeners.get(type), fn);
      assert.equal(capture, true);
      listeners.delete(type);
    },
  };
  let hit = new FakeElement("DIV", [historySelector]);
  const doc = {
    querySelector: () => history,
    elementFromPoint: (x, y) => { assert.ok(Number.isFinite(x + y)); return hit; },
  };
  const cleanup = observeClarityTouches(win, doc, (event, detail) => records.push({ event, detail }));
  const fire = (type, identifier = 1, x = 20, y = 100, target = hit) => {
    listeners.get(type)?.({
      type, target, changedTouches: [{ identifier, clientX: x, clientY: y }],
      composedPath: () => [target, ...Array(30).fill(new FakeElement("DIV"))],
      preventDefault() { assert.fail("Observation must not prevent defaults"); },
      stopPropagation() { assert.fail("Observation must not stop propagation"); },
    });
  };
  return { win, history, records, registrations, listeners, cleanup, fire, setHit: (element) => { hit = element; } };
}

test("regions distinguish controls, shell, history, heading and navigation without content", () => {
  const cases = [
    ["TEXTAREA", [textareaSelector, shellSelector], "textarea"],
    ["SVG", [shellSelector, 'button, input, select, a, [role="button"]'], "composer-control"],
    ["FORM", [shellSelector], "composer-shell"],
    ["P", [historySelector], "history"],
    ["SPAN", ['nav[aria-label="Primary"]'], "nav"],
    ["H1", ["[data-clarity-page-title], [data-clarity-page-intro]"], "page-heading-intro"],
    ["DIV", [], "other"],
  ];
  for (const [tag, selectors, expected] of cases) {
    assert.equal(clarityTouchRegion(new FakeElement(tag, selectors)), expected);
  }
  assert.equal(clarityTouchRegion(null), "other");
});

test("outside-origin gestures retain target/path and distinguish current hit testing", () => {
  const h = harness();
  const target = new FakeElement("MAIN");
  h.fire("touchstart", 4, 20, 100, target);
  h.setHit(new FakeElement("TEXTAREA", [textareaSelector]));
  h.fire("touchmove", 4, 25, 70, target);
  h.fire("touchend", 4, 30, 60, target);
  const [start, move, end] = h.records.map(r => r.detail);
  assert.equal(start.eventTarget, "main:other");
  assert.equal(start.pointRegion, "history");
  assert.equal(start.startPath.split(" > ").length, 12);
  assert.equal(move.pointRegion, "textarea");
  assert.equal(move.startTargetRegion, "other");
  assert.equal(move.deltaX, 5);
  assert.equal(move.deltaY, -30);
  assert.equal(end.clientY, 60);
  assert.equal(end.documentMoved, false);
  assert.equal(end.historyMoved, false);
  assert.doesNotMatch(JSON.stringify(h.records), /PRIVATE/);
  assert.ok(h.registrations.every(o => o.passive && o.capture));
  h.cleanup();
  assert.equal(h.listeners.size, 0);
});

test("end records document/history movement even when both return to their origins", () => {
  const h = harness();
  h.fire("touchstart");
  h.win.scrollY = 117;
  h.history.scrollTop = 250;
  h.listeners.get("scroll")();
  h.win.scrollY = 0;
  h.history.scrollTop = 200;
  h.fire("touchend");
  const end = h.records.at(-1).detail;
  assert.equal(end.documentMoved, true);
  assert.equal(end.historyMoved, true);
  assert.equal(end.documentScrollY, 0);
  assert.equal(end.historyScrollTop, 200);
  h.cleanup();
});

test("multi-touch cancellation is independent and active tracking is bounded", () => {
  const h = harness();
  for (let id = 0; id < 11; id++) h.fire("touchstart", id);
  assert.equal(h.records.length, 10);
  h.fire("touchcancel", 0, 25, 90);
  assert.equal(h.records.at(-1).event, "global-touch:touchcancel");
  const count = h.records.length;
  h.fire("touchmove", 0);
  assert.equal(h.records.length, count);
  h.fire("touchmove", 1, 40, 80);
  assert.equal(h.records.at(-1).detail.deltaX, 20);
  h.fire("touchstart", 11);
  assert.equal(h.records.at(-1).detail.identifier, 11);
  h.cleanup();
});

test("missing hit target and viewport are safe and unknown tags are redacted", () => {
  const h = harness();
  h.win.visualViewport = null;
  h.setHit(null);
  h.fire("touchstart", 1, 0, 0, new FakeElement("PRIVATE-CUSTOM-TAG"));
  const d = h.records[0].detail;
  assert.equal(d.eventTarget, "element:other");
  assert.equal(d.pointRegion, "other");
  assert.equal(d.visualViewportHeight, 741);
  assert.equal(d.visualViewportOffsetTop, 0);
  h.cleanup();
});

test("global observer is recording-gated in the existing query-gated bounded HUD", () => {
  const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
  const hud = read("../../../components/clarity/clarity-layout-debug.tsx");
  const ui = read("../../../components/clarity/clarity-conversation.tsx");
  const observer = read("./clarity-touch-diagnostics.ts");
  assert.match(hud, /if \(!recording\) return;\s*return observeClarityTouches/);
  assert.match(hud, /if \(recordingRef\.current\) capture\(event, detail\)/);
  assert.match(hud, /snapshot: readLayoutSnapshot\(\)/);
  assert.match(hud, /const MAX_TRACE_ENTRIES = 400/);
  assert.match(ui, /layoutDebugActive && \(/);
  assert.match(ui, /<ClarityLayoutDebug onDisable=\{disableLayoutDebug\}/);
  assert.doesNotMatch(observer, /preventDefault\(|stopPropagation\(|scrollTo\(|\.focus\(|\.blur\(|fetch\(|textContent|innerHTML|outerHTML|getAttribute\(|cookie|localStorage/);
});
