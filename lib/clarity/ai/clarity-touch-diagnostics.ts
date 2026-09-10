type TouchDetail = Record<string, boolean | number | string | null>;

const MAX_TRACKED_TOUCHES = 10;
const MAX_PATH_ELEMENTS = 12;
const SAFE_TAGS = new Set([
  "html", "body", "main", "header", "nav", "div", "span", "p", "h1", "h2",
  "h3", "form", "label", "textarea", "input", "button", "a", "img", "svg",
  "path", "section", "article", "aside", "ul", "ol", "li",
]);

export function clarityTouchRegion(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "other";
  if (target.closest("[data-clarity-layout-debug]")) return "other";
  if (target.closest('textarea[name="message"]')) return "textarea";
  if (target.closest("[data-clarity-composer-shell]")) {
    return target.closest('button, input, select, a, [role="button"]')
      ? "composer-control"
      : "composer-shell";
  }
  if (target.closest("[data-clarity-conversation-scroll]")) return "history";
  if (target.closest('nav[aria-label="Primary"]')) return "nav";
  if (target.closest("[data-clarity-page-title], [data-clarity-page-intro]")) {
    return "page-heading-intro";
  }
  return "other";
}

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "non-element:other";
  const tag = target.tagName.toLowerCase();
  // Never serialize text, arbitrary attributes, URLs, IDs, or form values.
  return `${SAFE_TAGS.has(tag) ? tag : "element"}:${clarityTouchRegion(target)}`;
}

type TrackedTouch = {
  startX: number;
  startY: number;
  startTarget: string;
  startTargetRegion: string;
  startPointElement: string;
  startPointRegion: string;
  startPath: string;
  startDocumentScrollY: number;
  startHistoryScrollTop: number | null;
  documentMoved: boolean;
  historyMoved: boolean;
};

// Installed only by the recording, query-gated debug HUD. Never owns a gesture.
export function observeClarityTouches(
  targetWindow: Window,
  targetDocument: Document,
  capture: (event: string, detail: TouchDetail) => void,
) {
  const touches = new Map<number, TrackedTouch>();
  const historyScrollTop = () => targetDocument.querySelector<HTMLElement>(
    "[data-clarity-conversation-scroll]",
  )?.scrollTop ?? null;
  const observeMovement = () => {
    const historyTop = historyScrollTop();
    for (const touch of touches.values()) {
      touch.documentMoved ||= targetWindow.scrollY !== touch.startDocumentScrollY;
      touch.historyMoved ||= historyTop !== touch.startHistoryScrollTop;
    }
  };
  const observeTouch = (event: TouchEvent) => {
    observeMovement();
    for (const point of Array.from(event.changedTouches)) {
      const pointElement = targetDocument.elementFromPoint(point.clientX, point.clientY);
      if (event.type === "touchstart") {
        if (touches.size >= MAX_TRACKED_TOUCHES) continue;
        touches.set(point.identifier, {
          startX: point.clientX,
          startY: point.clientY,
          startTarget: describeTarget(event.target),
          startTargetRegion: clarityTouchRegion(event.target),
          startPointElement: describeTarget(pointElement),
          startPointRegion: clarityTouchRegion(pointElement),
          startPath: event.composedPath().slice(0, MAX_PATH_ELEMENTS)
            .map(describeTarget).join(" > "),
          startDocumentScrollY: targetWindow.scrollY,
          startHistoryScrollTop: historyScrollTop(),
          documentMoved: false,
          historyMoved: false,
        });
      }
      const touch = touches.get(point.identifier);
      if (!touch) continue;
      const viewport = targetWindow.visualViewport;
      // The HUD adds its existing full focus/viewport/rect/scroll snapshot to
      // every record. Repeat the origin so a bounded trace remains interpretable.
      capture(`global-touch:${event.type}`, {
        identifier: point.identifier,
        clientX: point.clientX,
        clientY: point.clientY,
        deltaX: point.clientX - touch.startX,
        deltaY: point.clientY - touch.startY,
        eventTarget: describeTarget(event.target),
        targetRegion: clarityTouchRegion(event.target),
        pointElement: describeTarget(pointElement),
        pointRegion: clarityTouchRegion(pointElement),
        ...touch,
        documentScrollY: targetWindow.scrollY,
        visualViewportHeight: viewport?.height ?? targetWindow.innerHeight,
        visualViewportOffsetTop: viewport?.offsetTop ?? 0,
        historyScrollTop: historyScrollTop(),
      });
      if (event.type === "touchend" || event.type === "touchcancel") {
        touches.delete(point.identifier);
      }
    }
  };
  const options = { passive: true, capture: true } as const;
  const events = ["touchstart", "touchmove", "touchend", "touchcancel"] as const;
  for (const event of events) targetWindow.addEventListener(event, observeTouch, options);
  targetWindow.addEventListener("scroll", observeMovement, options);
  return () => {
    for (const event of events) targetWindow.removeEventListener(event, observeTouch, true);
    targetWindow.removeEventListener("scroll", observeMovement, true);
    touches.clear();
  };
}
