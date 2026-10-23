// Shared harness for docs video scenes: a signed-in hi-DPI browser framed per
// the product-screenshot-capture skill (16:9, 1920x1080 at 125% zoom), a
// recorded cursor path, and a frame + camera timeline for render.mjs.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export const OUT_DIR = path.join(import.meta.dirname, "out");
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/** The account created by `pnpm --filter=shared run db:seed`. */
const DEMO_USER = { email: "demo@langfuse.com", password: "password" };

/** 1920x1080 at 125% browser zoom, i.e. a 1536x864 CSS viewport. */
const VIEWPORT = { width: 1536, height: 864 };
const OUTPUT_ZOOM = 1.25;
/** Capture at 2x the output so camera zooms stay sharp. */
const CAPTURE_SCALE = OUTPUT_ZOOM * 2;

/** Runs a seed scenario and returns its JSON summary (ids + deep links). */
export function seed(scenario, flags = []) {
  // A shell lookup tolerates pnpm shims that are not directly executable.
  const stdout = execSync(
    ["pnpm run --silent seed --", scenario, ...flags, "--json"].join(" "),
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const summary = JSON.parse(stdout.trim().split("\n").at(-1));
  // Re-seeding replaces v4 rows, but until ClickHouse merges them the UI can
  // count duplicates (e.g. a graph node showing 2/6 instead of 1/3).
  // OPTIMIZE fails transiently while a background merge holds the parts, so
  // retry, and never fail the take over it.
  for (const table of ["events_full", "events_core"]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        execSync(
          `curl -sf --user "${process.env.CLICKHOUSE_USER ?? "clickhouse"}:${process.env.CLICKHOUSE_PASSWORD ?? "clickhouse"}" ` +
            `"${process.env.CLICKHOUSE_URL ?? "http://localhost:8124"}/" --data-binary "OPTIMIZE TABLE ${table} FINAL"`,
          { stdio: "ignore" },
        );
        break;
      } catch {
        execSync("sleep 2");
      }
    }
  }
  return summary;
}

// Injected into every page: hides dev-only chrome and draws click ripples. The
// cursor itself is composited by render.mjs from the recorded glide path, so
// its motion stays smooth even when the capture frame rate dips.
function decoratePage() {
  // Icon-rail navigation, per product-screenshot-capture.
  try {
    localStorage.setItem("sidebar:state", "false");
  } catch {}
  const mount = () => {
    const style = document.createElement("style");
    style.textContent = `
      nextjs-portal{display:none!important}
      .demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:56px;height:56px;
        margin:-28px 0 0 -28px;border-radius:50%;background:rgba(0,0,0,.08);
        border:2px solid rgba(0,0,0,.4);animation:demo-ripple .45s ease-out forwards}
      @keyframes demo-ripple{from{opacity:1;scale:.35}to{opacity:0;scale:1.25}}
      #demo-heartbeat{position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;
        pointer-events:none;animation:demo-beat .2s steps(2) infinite}
      @keyframes demo-beat{from{background:rgba(0,0,0,.01)}to{background:rgba(0,0,0,.02)}}`;
    document.head.appendChild(style);
    // The screencast only emits frames on paint and can drop the last one
    // before the page idles; a near-invisible ticker keeps frames coming.
    const heartbeat = document.createElement("div");
    heartbeat.id = "demo-heartbeat";
    document.body.appendChild(heartbeat);
    addEventListener(
      "mousedown",
      (e) => {
        const ripple = document.createElement("div");
        ripple.className = "demo-ripple";
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      },
      true,
    );
  };
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount);
}

/**
 * Cursor art in a 32x32 box with room for its shadow; the tip is at (9, 7).
 * Rasterized at 2x (`zoom`) so it stays crisp when render.mjs scales it up.
 */
const CURSOR_HTML = `<div style="zoom:2;width:32px;height:32px;padding:4px;box-sizing:border-box">
  <svg viewBox="0 0 24 24" width="24" height="24" style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))">
    <path d="M5 3l14 10-6.2 1.1 3.8 7.4-2.8 1.4-3.8-7.5L5 20z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  </svg></div>`;
export const CURSOR_TIP = { x: 9, y: 7, box: 32 };

/**
 * Opens a signed-in page and returns helpers for one recorded scene.
 * `record()` starts capturing frames; `finish()` writes them plus
 * `<name>.timeline.json` for render.mjs.
 */
export async function openScene(name) {
  const framesDir = path.join(OUT_DIR, `${name}-frames`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  // The screencast captures device pixels only when the scale factor is forced
  // at launch; deviceScaleFactor alone yields CSS-pixel frames.
  const browser = await chromium.launch({
    channel: "chromium",
    args: [`--force-device-scale-factor=${CAPTURE_SCALE}`],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: CAPTURE_SCALE,
    colorScheme: "light",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(decoratePage);
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/auth/sign-in`);
  const submit = page.getByTestId("submit-email-password-sign-in-form");
  // The button stays disabled until the form hydrates; refill until it enables.
  for (let i = 0; i < 60 && !(await submit.isEnabled()); i++) {
    await page.fill('input[name="email"]', DEMO_USER.email);
    await page.fill('input[type="password"]', DEMO_USER.password);
    await page.waitForTimeout(500);
  }
  await submit.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });

  let mouse = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.62 };
  let start = mouse;
  const frames = [];
  const keyframes = [];
  const cuts = [];

  const glides = [];
  const clicks = [];

  /**
   * Records an eased glide along a shallow arc (drawn by render.mjs) and
   * lands the real pointer at the end, so hover and click states are genuine.
   */
  async function glideTo(x, y, ms = 700) {
    const from = mouse;
    const dx = x - from.x;
    const dy = y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(0.12 * len, 60);
    const ctrl = {
      x: from.x + dx / 2 + (-dy / len) * bend,
      y: from.y + dy / 2 + (dx / len) * bend,
    };
    const t = Date.now();
    glides.push({ t0: t, t1: t + ms, from, ctrl, to: { x, y } });
    await page.waitForTimeout(ms);
    await page.mouse.move(x, y);
    mouse = { x, y };
  }

  /** `at` is the click point as a fraction of the box; default is its center. */
  async function glideClick(locator, ms, at = { x: 0.5, y: 0.5 }) {
    const box = await locator.boundingBox();
    await glideTo(box.x + box.width * at.x, box.y + box.height * at.y, ms);
    await page.waitForTimeout(140);
    clicks.push(Date.now());
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  }

  /** Camera reaches `box` (CSS px) at `zoom` now; render.mjs eases between keyframes. */
  const focus = (box, zoom) => keyframes.push({ t: Date.now(), ...box, zoom });
  const wide = () => focus({ x: 0, y: 0, ...VIEWPORT }, 1);

  return {
    page,
    viewport: VIEWPORT,
    glideTo,
    glideClick,
    focus,
    wide,
    /**
     * Runs `fn` (e.g. a save that waits on the server) and cuts its duration
     * from the video: the take resumes on the state `fn` left behind. Keep
     * the cursor still inside `fn`.
     */
    async cut(fn) {
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        // The screencast only emits frames on paint; force one so the take
        // resumes on the current state rather than a stale frame.
        await page
          .evaluate(
            () =>
              new Promise((resolve) => {
                const dot = document.createElement("div");
                dot.style.cssText =
                  "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;background:#000;pointer-events:none";
                document.body.appendChild(dot);
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    dot.remove();
                    resolve();
                  }),
                );
              }),
          )
          .catch(() => {});
        cuts.push({ t0, t1: Date.now() });
      }
    },
    /** Parks the cursor without animation, e.g. before the take starts. */
    async placeCursor(x, y) {
      await page.mouse.move(x, y);
      mouse = { x, y };
    },
    async record() {
      start = mouse;
      await page.screencast.start({
        size: {
          width: VIEWPORT.width * CAPTURE_SCALE,
          height: VIEWPORT.height * CAPTURE_SCALE,
        },
        quality: Number(process.env.CAPTURE_QUALITY ?? 92),
        onFrame: ({ data, timestamp }) => {
          const file = `${String(frames.length).padStart(5, "0")}.jpg`;
          fs.writeFileSync(path.join(framesDir, file), data);
          frames.push({ file, t: timestamp });
        },
      });
      wide();
    },
    async finish() {
      const end = Date.now();
      await page.screencast.stop();
      const art = await context.newPage();
      await art.setContent(
        `<body style="margin:0;background:transparent">${CURSOR_HTML}</body>`,
      );
      await art
        .locator("div")
        .first()
        .screenshot({
          path: path.join(OUT_DIR, "cursor.png"),
          omitBackground: true,
        });
      await browser.close();
      // Frame timestamps and keyframes share the wall clock (ms). Cut spans
      // collapse to their end: only the last frame inside a cut survives,
      // shown where the take resumes.
      // Frames can arrive slightly out of timestamp order.
      frames.sort((a, b) => a.t - b.t);
      const t0 = frames[0].t;
      const cutMs = (t) =>
        cuts.reduce((sum, c) => sum + Math.max(0, Math.min(t, c.t1) - c.t0), 0);
      const rel = (t) => Math.max(0, (t - t0 - cutMs(t)) / 1000);
      const kept = frames.filter(
        (f, i) =>
          !cuts.some(
            (c) => f.t > c.t0 && f.t < c.t1 && frames[i + 1]?.t < c.t1,
          ),
      );
      const timeline = {
        viewport: VIEWPORT,
        scale: CAPTURE_SCALE,
        outputZoom: OUTPUT_ZOOM,
        duration: rel(end),
        frames: kept.map((f) => ({ file: f.file, t: rel(f.t) })),
        keyframes: keyframes.map((k) => ({ ...k, t: rel(k.t) })),
        cursor: {
          start,
          glides: glides.map((g) => ({ ...g, t0: rel(g.t0), t1: rel(g.t1) })),
          clicks: clicks.map(rel),
        },
      };
      fs.writeFileSync(
        path.join(OUT_DIR, `${name}.timeline.json`),
        JSON.stringify(timeline, null, 2),
      );
    },
  };
}
