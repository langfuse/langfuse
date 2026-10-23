// Helpers for the prompt-usage scenes (prompt-linking, prompt-metrics,
// playground-*): a seed call that survives a busy ClickHouse, and jump cuts
// for waits on slow data loads.
import { execSync } from "node:child_process";
import { seed } from "./lib.mjs";

/** Seeds the prompt usage data; retries while other seeds exhaust memory. */
export function seedPromptUsage() {
  for (let attempt = 0; ; attempt++) {
    try {
      return seed("docs-demo-prompt-usage", [
        "--project",
        "docs-demo",
        "--id-prefix",
        "7c3e9a1f5b2d4e60",
      ]);
    } catch (error) {
      if (attempt >= 3) throw error;
      execSync("sleep 20");
    }
  }
}

/**
 * On a prompt's Metrics page, hides "First Used" and every score column
 * except `keep` (storage keys such as "Trace-toxicity-EVAL-NUMERIC"), then
 * reloads. Visibility is stored per project in localStorage.
 */
export async function showOnlyScoreColumns(page, keep) {
  await skeletonsGone(page);
  // Toggling one column makes the table store the full visibility map.
  await page.getByRole("button", { name: /Columns/ }).click();
  await page.locator("#col-firstUsed").click();
  await page.keyboard.press("Escape");
  await page.evaluate((keepKeys) => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("promptVersionsColumnVisibility-"),
    );
    const visibility = JSON.parse(localStorage.getItem(key));
    for (const column of Object.keys(visibility)) {
      if (/^(Trace|Generation)-/.test(column)) {
        visibility[column] = keepKeys.includes(column);
      }
    }
    visibility.firstUsed = false;
    localStorage.setItem(key, JSON.stringify(visibility));
  }, keep);
  await page.reload();
  await skeletonsGone(page);
}

/** Resolves once no loading skeleton has been on the page for `quietMs`. */
export async function skeletonsGone(page, quietMs = 1500, timeout = 90_000) {
  await page.evaluate(() => {
    window.__lastSkeletonAt = performance.now();
  });
  await page.waitForFunction(
    (quiet) => {
      const now = performance.now();
      if (document.querySelectorAll(".animate-pulse").length > 0) {
        window.__lastSkeletonAt = now;
      }
      return now - window.__lastSkeletonAt > quiet;
    },
    quietMs,
    { timeout, polling: 50 },
  );
}

// Camera and cut helpers on top of lib.mjs. The renderer eases the camera
// between consecutive keyframes, so a hold before a move would otherwise
// turn into a slow drift: every glide and cut pins the current camera first,
// and the camera only moves while the cursor does.
export function withCuts(scene) {
  let camera = null;
  const focus = (box, zoom) => {
    camera = { box, zoom };
    scene.focus(box, zoom);
  };
  const wide = () => {
    camera = null;
    scene.wide();
  };
  const pin = () => (camera ? focus(camera.box, camera.zoom) : wide());
  const { page } = scene;

  const glideTo = async (x, y, ms) => {
    pin();
    await scene.glideTo(x, y, ms);
  };
  const glideClick = async (locator, ms, at) => {
    pin();
    await scene.glideClick(locator, ms, at);
  };

  return {
    ...scene,
    focus,
    wide,
    glideTo,
    glideClick,
    async record() {
      await scene.record();
      camera = null;
    },
    /** Runs `wait` and cuts its duration; the camera holds still meanwhile. */
    async hidden(wait) {
      pin();
      await scene.cut(wait);
      pin();
    },
    /**
     * Glides to `locator` and clicks it, cutting the wait for the result. The
     * cut starts right after the press: dispatching the mouse-up can block
     * for as long as the click's re-render takes.
     */
    async clickHidden(locator, ms, at = { x: 0.5, y: 0.5 }, wait) {
      const box = await locator.boundingBox();
      await glideTo(box.x + box.width * at.x, box.y + box.height * at.y, ms);
      await page.waitForTimeout(140);
      await page.mouse.down();
      await page.waitForTimeout(120);
      await scene.cut(async () => {
        await page.mouse.up();
        await wait();
      });
      pin();
    },
  };
}
