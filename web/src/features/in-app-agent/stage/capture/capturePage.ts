import { CAPTURE_EXCLUDED_SELECTORS } from "@/src/features/in-app-agent/stage/constants";

export type PageCapture = {
  /** The page as pixels, `cssWidth * scale` by `cssHeight * scale`. */
  canvas: HTMLCanvasElement;
  scale: number;
  cssWidth: number;
  cssHeight: number;
  durationMs: number;
};

export const CAPTURE_FIT_ATTRIBUTE = "data-assistant-capture-fit";
const FIT_STYLE_ID = "assistant-capture-fit-style";
const ELLIPSIS_CANDIDATES = '.truncate, [class*="text-ellipsis"]';

/**
 * The capture engine re-implements `text-overflow: ellipsis` from
 * `scrollWidth`, which also counts decorative overflow such as a dotted
 * underline pseudo-element, and then replaces text that visibly fits with "…".
 * Elements whose text run really fits are switched to `clip` for the capture,
 * which renders identically on the live page.
 */
function markTextThatFits(root: ParentNode): Element[] {
  const marked: Element[] = [];
  const range = document.createRange();
  for (const element of root.querySelectorAll(ELLIPSIS_CANDIDATES)) {
    if (element.scrollWidth <= element.clientWidth) {
      continue;
    }
    range.selectNodeContents(element);
    const style = getComputedStyle(element);
    const contentWidth =
      element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    if (range.getBoundingClientRect().width <= contentWidth + 0.5) {
      element.setAttribute(CAPTURE_FIT_ATTRIBUTE, "");
      marked.push(element);
    }
  }
  return marked;
}

function ensureFitStyle() {
  if (document.getElementById(FIT_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = FIT_STYLE_ID;
  style.textContent = `[${CAPTURE_FIT_ATTRIBUTE}]{text-overflow:clip!important}`;
  document.head.appendChild(style);
}

/** Overlay scrollbars are invisible on the page but paint in the capture. */
const hideScrollbarsPlugin = {
  name: "assistant-stage-hide-scrollbars",
  afterClone(context: { clone?: HTMLElement | SVGElement | null }) {
    const clone = context.clone;
    if (!clone) {
      return;
    }
    const style = document.createElement("style");
    style.textContent =
      "*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}";
    clone.prepend(style);
  },
};

function placeholderImageUrl(info: { width?: number; height?: number }) {
  const width = Math.max(1, Math.round(info.width ?? 1));
  const height = Math.max(1, Math.round(info.height ?? 1));
  const muted = getComputedStyle(document.documentElement)
    .getPropertyValue("--muted")
    .trim();
  const fill = muted ? `hsl(${muted})` : "transparent";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="${Math.min(width, height) / 2}" fill="${fill}"/></svg>`,
  )}`;
}

/**
 * A cross-origin image loaded without CORS cannot be read into a canvas, and
 * fetching it to try fails loudly (CORS) or is refused by the page's CSP.
 * It is left out of the capture, keeping its space, instead.
 */
function isReadableImage(element: Element) {
  if (!(element instanceof HTMLImageElement) || element.crossOrigin !== null) {
    return true;
  }
  const source = element.currentSrc || element.src;
  if (!source || source.startsWith("data:") || source.startsWith("blob:")) {
    return true;
  }
  try {
    return (
      new URL(source, window.location.href).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

/**
 * Renders what the user sees — the app and its open panels, without transient
 * overlays — into a canvas. The live page is not modified beyond temporary
 * attributes that do not change its rendering.
 */
export async function capturePage(
  scale: number,
  options: { yieldToPage: boolean },
): Promise<PageCapture> {
  const { snapdom } = await import("@zumer/snapdom");
  const startedAt = performance.now();
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  ensureFitStyle();
  const marked = markTextThatFits(document.body);
  try {
    const canvas = await snapdom.toCanvas(document.body, {
      dpr: scale,
      scale: 1,
      // Background captures hand the event loop a turn every frame, so the
      // page stays responsive; on-demand ones run in one task, the fastest.
      fast: !options.yieldToPage,
      embedFonts: true,
      reconcile: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      exclude: CAPTURE_EXCLUDED_SELECTORS,
      excludeMode: "remove",
      filter: isReadableImage,
      filterMode: "hide",
      fallbackURL: placeholderImageUrl,
      plugins: [hideScrollbarsPlugin],
    });
    return {
      canvas,
      scale,
      cssWidth,
      cssHeight,
      durationMs: performance.now() - startedAt,
    };
  } finally {
    for (const element of marked) {
      element.removeAttribute(CAPTURE_FIT_ATTRIBUTE);
    }
  }
}
