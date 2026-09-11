import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const baseUrl = process.env.CLARITY_BROWSER_BASE_URL;
const email = process.env.CLARITY_BROWSER_EMAIL;
const password = process.env.CLARITY_BROWSER_PASSWORD;
const chromeExecutable =
  process.env.CLARITY_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test(
  "real bottom-tab navigation restores a retained Clarity history at latest",
  { timeout: 60_000 },
  async () => {
    assert.ok(baseUrl, "CLARITY_BROWSER_BASE_URL is required");
    assert.ok(email, "CLARITY_BROWSER_EMAIL is required");
    assert.ok(password, "CLARITY_BROWSER_PASSWORD is required");

    const profile = await mkdtemp(join(tmpdir(), "clarity-route-browser-"));
    const chrome = spawn(
      chromeExecutable,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    try {
      const port = await readDevToolsPort(profile);
      const target = await fetch(
        `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/auth/login`)}`,
        { method: "PUT" },
      ).then((response) => response.json());
      const cdp = await createCdpClient(target.webSocketDebuggerUrl);

      try {
        await cdp.command("Page.enable");
        await cdp.command("Runtime.enable");
        await setMobileViewport(cdp, 844);
        await cdp.command("Page.navigate", { url: `${baseUrl}/auth/login` });
        await cdp.waitFor(
          `document.readyState === "complete" && document.querySelector("#email")`,
        );
        await cdp.evaluate(`(() => {
          const setValue = (selector, value) => {
            const input = document.querySelector(selector);
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            ).set;
            setter.call(input, value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          };
          setValue("#email", ${JSON.stringify(email)});
          setValue("#password", ${JSON.stringify(password)});
          document.querySelector("form").requestSubmit();
        })()`);
        await waitForPath(cdp, "/today");

        await clickBottomTab(cdp, "Clarity");
        const first = await waitForReadyClarity(cdp);
        assertAtExactBottom(first);
        assert.ok(first.scrollHeight > first.clientHeight, "fixture must overflow");

        await cdp.evaluate(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          history.dataset.browserIdentity = "retained-history";
          const textarea = document.querySelector(
            "[data-clarity-composer-shell] textarea",
          );
          const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          ).set;
          setter.call(textarea, "Unsaved route-retention draft");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        })()`);

        const returns = [];
        for (let visit = 1; visit <= 3; visit += 1) {
          await clickBottomTab(cdp, "Today");
          await waitForPath(cdp, "/today");
          const inactive = await cdp.evaluate(`(() => {
            const retained = document.querySelector(
              '[data-clarity-conversation-scroll][data-browser-identity="retained-history"]',
            );
            const main = document.querySelector("main");
            return {
              retained: Boolean(retained),
              retainedScrollTop: retained?.scrollTop ?? null,
              mainOverflowY: getComputedStyle(main).overflowY,
            };
          })()`);
          assert.equal(inactive.retained, true, "Next Activity retained the route");
          assert.notEqual(
            inactive.mainOverflowY,
            "hidden",
            "inactive Clarity markup must not keep its route-only shell layout",
          );

          await cdp.evaluate(`(() => {
            window.__clarityVisibleFrames = [];
            let remaining = 120;
            const sample = () => {
              const route = document.querySelector(
                "[data-clarity-conversation-route]",
              );
              const history = route?.querySelector(
                "[data-clarity-conversation-scroll]",
              );
              const content = route?.querySelector(
                "[data-clarity-history-content]",
              );
              if (route?.getClientRects().length && history && content) {
                window.__clarityVisibleFrames.push({
                  scrollTop: history.scrollTop,
                  max: history.scrollHeight - history.clientHeight,
                  contentVisibility: getComputedStyle(content).visibility,
                });
              }
              remaining -= 1;
              if (remaining > 0) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          })()`);
          await clickBottomTab(cdp, "Clarity");
          const measurement = await waitForReadyClarity(cdp);
          const routeState = await cdp.evaluate(`(() => ({
            sameHistoryNode: Boolean(document.querySelector(
              '[data-clarity-conversation-scroll][data-browser-identity="retained-history"]',
            )),
            draft: document.querySelector(
              "[data-clarity-composer-shell] textarea",
            ).value,
            visibleFrames: window.__clarityVisibleFrames,
          }))()`);

          assertAtExactBottom(measurement);
          assert.equal(routeState.sameHistoryNode, true);
          assert.equal(routeState.draft, "Unsaved route-retention draft");
          assert.ok(routeState.visibleFrames.length > 0);
          assert.equal(
            routeState.visibleFrames.some(
              (frame) =>
                frame.contentVisibility === "visible" &&
                Math.abs(frame.scrollTop - frame.max) >= 1,
            ),
            false,
            "no visible route-entry frame may expose the oldest messages",
          );
          returns.push(measurement);
        }

        const manual = await cdp.evaluate(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          history.scrollTop = Math.floor(
            (history.scrollHeight - history.clientHeight) / 2,
          );
          return history.scrollTop;
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(
          await cdp.evaluate(
            `document.querySelector("[data-clarity-conversation-scroll]").scrollTop`,
          ),
          manual,
          "entry-only positioning must not override later manual scrolling",
        );

        await cdp.waitFor(
          `Boolean(document.querySelector("[data-clarity-jump-to-latest]"))`,
        );
        const jumpHit = await cdp.evaluate(`(() => {
          const button = document.querySelector(
            "[data-clarity-jump-to-latest]",
          );
          const rect = button.getBoundingClientRect();
          return document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )?.closest("[data-clarity-jump-to-latest]") === button;
        })()`);
        assert.equal(jumpHit, true, "the floating latest button remains interactive");
        await cdp.evaluate(
          `document.querySelector("[data-clarity-jump-to-latest]").click()`,
        );
        await cdp.waitFor(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          return Math.abs(
            history.scrollTop - (history.scrollHeight - history.clientHeight),
          ) < 1 && !document.querySelector("[data-clarity-jump-to-latest]");
        })()`);
        const jumped = await cdp.evaluate(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          const content = document.querySelector(
            "[data-clarity-history-content]",
          );
          const dock = document.querySelector("[data-clarity-composer-dock]");
          return {
            scrollTop: history.scrollTop,
            clientHeight: history.clientHeight,
            scrollHeight: history.scrollHeight,
            max: history.scrollHeight - history.clientHeight,
            contentBottom: content.getBoundingClientRect().bottom,
            dockTop: dock.getBoundingClientRect().top,
          };
        })()`);
        assertAtExactBottom(jumped);
        assert.ok(
          jumped.contentBottom <= jumped.dockTop + 1,
          "the latest message must remain fully above the live composer dock",
        );

        await cdp.evaluate(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          history.scrollTop = Math.max(0, history.scrollTop - 160);
        })()`);
        await cdp.waitFor(
          `Boolean(document.querySelector("[data-clarity-jump-to-latest]"))`,
        );
        await cdp.evaluate(
          `document.querySelector("[data-clarity-jump-to-latest]").click()`,
        );
        await cdp.waitFor(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          return Math.abs(
            history.scrollTop - (history.scrollHeight - history.clientHeight),
          ) < 1;
        })()`);

        await cdp.evaluate(`document.querySelector(
          "[data-clarity-composer-shell] textarea",
        ).focus({ preventScroll: true })`);
        await setMobileViewport(cdp, 400);
        await cdp.waitFor(
          `document.querySelector("[data-clarity-conversation-panel]")?.dataset.clarityKeyboardPhase === "open"`,
        );
        await cdp.waitFor(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          return Math.abs(
            history.scrollTop - (history.scrollHeight - history.clientHeight),
          ) < 1;
        })()`);
        const canvasHitTesting = await cdp.evaluate(`(() => {
          const history = document.querySelector(
            "[data-clarity-conversation-scroll]",
          );
          const content = document.querySelector(
            "[data-clarity-history-content]",
          );
          const inset = document.querySelector(
            "[data-clarity-history-bottom-inset]",
          );
          const dock = document.querySelector("[data-clarity-composer-dock]");
          const scrim = document.querySelector("[data-clarity-composer-scrim]");
          const historyRect = history.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const insetRect = inset.getBoundingClientRect();
          const dockRect = dock.getBoundingClientRect();
          const messages = [...document.querySelectorAll(
            "[data-clarity-conversation-message]",
          )].map((element) => ({
            element,
            rect: element.getBoundingClientRect(),
          }));
          const visible = messages.filter(
            ({ rect }) =>
              rect.bottom > historyRect.top && rect.top < dockRect.top,
          );
          const last = messages.at(-1);
          const text = last?.element.querySelector("p, div");
          const textRect = text?.getBoundingClientRect();
          const visibleGapPair = visible.slice(0, -1).map((item, index) => ({
            before: item,
            after: visible[index + 1],
          })).find(({ before, after }) => after.rect.top - before.rect.bottom >= 4);
          const describePoint = (x, y) => {
            const target = document.elementFromPoint(x, y);
            return {
              x,
              y,
              tag: target?.tagName?.toLowerCase() ?? null,
              historyOwned:
                target === history || Boolean(target && history.contains(target)),
              messageOwned: Boolean(
                target?.closest("[data-clarity-conversation-message]"),
              ),
            };
          };
          const x = historyRect.left + 8;
          const describeMessageGap = () => {
            if (visibleGapPair) {
              return describePoint(
                x,
                (visibleGapPair.before.rect.bottom +
                  visibleGapPair.after.rect.top) / 2,
              );
            }
            const pair = messages.slice(0, -1).map((item, index) => ({
              before: item,
              after: messages[index + 1],
            })).find(({ before, after }) =>
              after.rect.top - before.rect.bottom >= 4,
            );
            if (!pair) return null;
            const originalScrollTop = history.scrollTop;
            const currentGap = (pair.before.rect.bottom + pair.after.rect.top) / 2;
            const targetY = historyRect.top + historyRect.height / 2;
            history.scrollTop = Math.max(
              0,
              Math.min(
                history.scrollHeight - history.clientHeight,
                originalScrollTop + currentGap - targetY,
              ),
            );
            const beforeRect = pair.before.element.getBoundingClientRect();
            const afterRect = pair.after.element.getBoundingClientRect();
            const point = describePoint(
              x,
              (beforeRect.bottom + afterRect.top) / 2,
            );
            history.scrollTop = originalScrollTop;
            return point;
          };
          const points = {
            messageText: textRect
              ? describePoint(
                  textRect.left + Math.min(8, textRect.width / 2),
                  Math.max(
                    historyRect.top + 4,
                    Math.min(
                      dockRect.top - 4,
                      textRect.top + Math.min(8, textRect.height / 2),
                    ),
                  ),
                )
              : null,
            messageCard: last
              ? describePoint(
                  last.rect.right - 8,
                  Math.max(historyRect.top + 4, last.rect.top + 8),
                )
              : null,
            betweenMessages: describeMessageGap(),
            blankAfterLast:
              last && contentRect.bottom - last.rect.bottom >= 4
                ? describePoint(x, (last.rect.bottom + contentRect.bottom) / 2)
                : null,
            behindScrim: describePoint(x, dockRect.top - 6),
          };
          return {
            points,
            historyRect: { top: historyRect.top, bottom: historyRect.bottom },
            contentBottom: contentRect.bottom,
            lastMessageBottom: last?.rect.bottom ?? null,
            dockTop: dockRect.top,
            insetHeight: insetRect.height,
            insetOwnedByHistory: history.contains(inset),
            insetPointerEvents: getComputedStyle(inset).pointerEvents,
            scrimPointerEvents: getComputedStyle(scrim).pointerEvents,
          };
        })()`);
        assert.equal(canvasHitTesting.scrimPointerEvents, "none");
        assert.equal(canvasHitTesting.insetOwnedByHistory, true);
        assert.equal(canvasHitTesting.insetPointerEvents, "none");
        assert.ok(canvasHitTesting.insetHeight > 0, JSON.stringify(canvasHitTesting));
        assert.ok(
          canvasHitTesting.contentBottom <= canvasHitTesting.dockTop + 1,
          JSON.stringify(canvasHitTesting),
        );
        assert.ok(
          canvasHitTesting.contentBottom - canvasHitTesting.lastMessageBottom >= 8,
          JSON.stringify(canvasHitTesting),
        );
        for (const [label, point] of Object.entries(canvasHitTesting.points)) {
          assert.ok(point, `${label} must have a physical test coordinate`);
          assert.equal(
            point.historyOwned,
            true,
            `${label} must resolve to the single history owner: ${JSON.stringify(point)}`,
          );
        }

        await setMobileViewport(cdp, 844);
        await cdp.evaluate(`document.querySelector(
          "[data-clarity-composer-shell] textarea",
        ).blur()`);
        await cdp.waitFor(
          `document.querySelector("[data-clarity-conversation-panel]")?.dataset.clarityKeyboardPhase === "closed"`,
        );

        await cdp.evaluate(`(() => {
          const textarea = document.querySelector(
            "[data-clarity-composer-shell] textarea",
          );
          const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          ).set;
          setter.call(
            textarea,
            ${JSON.stringify("Long composer text ".repeat(120))},
          );
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.focus({ preventScroll: true });
        })()`);
        await cdp.waitFor(`(() => {
          const textarea = document.querySelector(
            "[data-clarity-composer-shell] textarea",
          );
          return textarea.scrollHeight > textarea.clientHeight &&
            getComputedStyle(textarea).overflowY === "auto";
        })()`);
        await cdp.evaluate(`(() => {
          window.__clarityDockRaceFrames = [];
          let remaining = 20;
          const sample = (timestamp) => {
            const history = document.querySelector(
              "[data-clarity-conversation-scroll]",
            );
            const content = document.querySelector(
              "[data-clarity-history-content]",
            );
            const inset = document.querySelector(
              "[data-clarity-history-bottom-inset]",
            );
            const dock = document.querySelector(
              "[data-clarity-composer-dock]",
            );
            window.__clarityDockRaceFrames.push({
              timestamp,
              phase: document.querySelector(
                "[data-clarity-conversation-panel]",
              )?.dataset.clarityKeyboardPhase,
              scrollTop: history?.scrollTop,
              scrollHeight: history?.scrollHeight,
              clientHeight: history?.clientHeight,
              contentBottom: content?.getBoundingClientRect().bottom,
              dockTop: dock?.getBoundingClientRect().top,
              insetHeight: inset?.getBoundingClientRect().height,
            });
            remaining -= 1;
            if (remaining > 0) requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        })()`);
        await setMobileViewport(cdp, 400);
        await cdp.waitFor(
          `document.querySelector("[data-clarity-conversation-panel]")?.dataset.clarityKeyboardPhase === "open"`,
        );
        await cdp.waitFor(`window.__clarityDockRaceFrames?.length >= 12`);
        const keyboard = await cdp.evaluate(`(() => {
          const dock = document.querySelector("[data-clarity-composer-dock]");
          const shell = document.querySelector("[data-clarity-composer-shell]");
          const textarea = shell.querySelector("textarea");
          const dockRect = dock.getBoundingClientRect();
          const shellRect = shell.getBoundingClientRect();
          const textareaRect = textarea.getBoundingClientRect();
          const shellStyle = getComputedStyle(shell);
          const textareaStyle = getComputedStyle(textarea);
          const visualTop = window.visualViewport.offsetTop;
          const visualBottom = visualTop + window.visualViewport.height;
          return {
            innerHeight: window.innerHeight,
            visibleHeight: window.visualViewport.height,
            visibleOffsetTop: window.visualViewport.offsetTop,
            visualTop,
            visualBottom,
            dockTop: dockRect.top,
            dockBottom: dockRect.bottom,
            shellTop: shellRect.top,
            shellBottom: shellRect.bottom,
            shellLeft: shellRect.left,
            shellRight: shellRect.right,
            shellBorderTopWidth: shellStyle.borderTopWidth,
            shellBorderTopStyle: shellStyle.borderTopStyle,
            shellBorderRadius: shellStyle.borderTopLeftRadius,
            shellBackground: shellStyle.backgroundColor,
            textareaTop: textareaRect.top,
            textareaBottom: textareaRect.bottom,
            textareaScrollTop: textarea.scrollTop,
            textareaScrollHeight: textarea.scrollHeight,
            textareaClientHeight: textarea.clientHeight,
            textareaOverflowY: textareaStyle.overflowY,
            contentBottom: document.querySelector(
              "[data-clarity-history-content]",
            ).getBoundingClientRect().bottom,
            raceFrames: window.__clarityDockRaceFrames,
          };
        })()`);
        assert.ok(
          keyboard.shellTop >= keyboard.visualTop,
          JSON.stringify(keyboard),
        );
        assert.ok(
          keyboard.shellBottom <= keyboard.visualBottom + 1,
          JSON.stringify(keyboard),
        );
        assert.ok(
          keyboard.textareaTop > keyboard.shellTop,
          JSON.stringify(keyboard),
        );
        assert.ok(
          keyboard.textareaBottom < keyboard.shellBottom,
          JSON.stringify(keyboard),
        );
        assert.equal(keyboard.shellBorderTopWidth, "1px");
        assert.equal(keyboard.shellBorderTopStyle, "solid");
        assert.notEqual(keyboard.shellBorderRadius, "0px");
        assert.notEqual(keyboard.shellBackground, "rgba(0, 0, 0, 0)");
        assert.notEqual(keyboard.shellBackground, "transparent");
        assert.ok(
          keyboard.textareaScrollHeight > keyboard.textareaClientHeight,
          JSON.stringify(keyboard),
        );
        assert.equal(keyboard.textareaOverflowY, "auto");
        assert.equal(
          keyboard.raceFrames.every(
            (frame) => frame.contentBottom <= frame.dockTop + 1,
          ),
          true,
          JSON.stringify(keyboard.raceFrames),
        );
        assert.ok(
          keyboard.contentBottom <= keyboard.dockTop + 1,
          JSON.stringify(keyboard),
        );

        console.log(
          JSON.stringify({ initial: first, returns, jumped, keyboard }, null, 2),
        );
      } finally {
        cdp.close();
      }
    } finally {
      if (chrome.exitCode === null) {
        chrome.kill("SIGTERM");
        await Promise.race([
          once(chrome, "exit"),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);

async function setMobileViewport(cdp, height) {
  await cdp.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
}

async function clickBottomTab(cdp, label) {
  await cdp.evaluate(`(() => {
    const link = [...document.querySelectorAll(
      'nav[aria-label="Primary"] a',
    )].find((item) => item.textContent.trim() === ${JSON.stringify(label)});
    if (!link) throw new Error("Missing bottom tab: " + ${JSON.stringify(label)});
    link.click();
  })()`);
}

async function waitForPath(cdp, pathname) {
  await cdp.waitFor(`location.pathname === ${JSON.stringify(pathname)}`);
}

async function waitForReadyClarity(cdp) {
  await cdp.waitFor(`(() => {
    if (location.pathname !== "/clarity") return false;
    const route = [...document.querySelectorAll(
      "[data-clarity-conversation-route]",
    )].find((item) => item.getClientRects().length > 0);
    const content = route?.querySelector("[data-clarity-history-content]");
    return content && getComputedStyle(content).visibility === "visible";
  })()`);
  return cdp.evaluate(`(() => {
    const route = [...document.querySelectorAll(
      "[data-clarity-conversation-route]",
    )].find((item) => item.getClientRects().length > 0);
    const history = route.querySelector("[data-clarity-conversation-scroll]");
    return {
      scrollTop: history.scrollTop,
      clientHeight: history.clientHeight,
      scrollHeight: history.scrollHeight,
    };
  })()`);
}

function assertAtExactBottom(measurement) {
  const expected = measurement.scrollHeight - measurement.clientHeight;
  assert.ok(
    Math.abs(measurement.scrollTop - expected) < 1,
    JSON.stringify({ ...measurement, expected }),
  );
}

async function readDevToolsPort(profile) {
  const file = join(profile, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const [port] = (await readFile(file, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch {
      // Chrome creates the file after its debugging endpoint is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });

  const command = (method, params = {}) => {
    const id = ++sequence;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  };
  const waitFor = async (predicate, timeoutMs = 20_000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${predicate})`)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${predicate}`);
  };

  return { command, evaluate, waitFor, close: () => socket.close() };
}
