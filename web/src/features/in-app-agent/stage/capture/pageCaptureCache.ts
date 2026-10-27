import {
  capturePage,
  type PageCapture,
} from "@/src/features/in-app-agent/stage/capture/capturePage";
import { CAPTURE_EXCLUDED_SELECTORS } from "@/src/features/in-app-agent/stage/constants";

export type PageCaptureCache = {
  /** Starts a capture in the background unless a current one exists. */
  prewarm: () => void;
  /** A capture of the page as it is now, reusing a warm one when still valid. */
  acquire: () => Promise<PageCapture>;
  dispose: () => void;
};

type Pending = { generation: number; promise: Promise<PageCapture> };

const IGNORED_SUBTREES = CAPTURE_EXCLUDED_SELECTORS.join(",");

function isIgnoredTarget(target: Node | null): boolean {
  const element =
    target instanceof Element ? target : (target?.parentElement ?? null);
  return Boolean(element?.closest(IGNORED_SUBTREES));
}

/**
 * Keeps at most one capture of the page and knows when it went stale: any DOM
 * change, scroll, resize or theme switch outside the transient overlays makes
 * the next `acquire` capture again. Warming on launcher hover/focus/touch lets
 * most opens skip the capture cost entirely.
 */
export function createPageCaptureCache(params: {
  resolveScale: () => number;
}): PageCaptureCache {
  let generation = 0;
  let warm: { generation: number; scale: number; capture: PageCapture } | null =
    null;
  let pending: Pending | null = null;
  let isCapturing = false;

  const invalidate = () => {
    generation += 1;
  };

  const observer = new MutationObserver((records) => {
    if (isCapturing) {
      return;
    }
    if (records.some((record) => !isIgnoredTarget(record.target))) {
      invalidate();
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

  const onScroll = (event: Event) => {
    if (!isIgnoredTarget(event.target instanceof Node ? event.target : null)) {
      invalidate();
    }
  };
  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", invalidate);

  const start = (): Pending => {
    const startedGeneration = generation;
    const scale = params.resolveScale();
    isCapturing = true;
    const promise = capturePage(scale)
      .then((capture) => {
        // Changes the capture itself made (temporary attributes, the engine's
        // measurement clone) are not changes to the page.
        observer.takeRecords();
        if (generation === startedGeneration) {
          warm = { generation: startedGeneration, scale, capture };
        }
        return capture;
      })
      .finally(() => {
        isCapturing = false;
        if (pending?.promise === promise) {
          pending = null;
        }
      });
    pending = { generation: startedGeneration, promise };
    return pending;
  };

  const isCurrent = (entry: { generation: number } | null) =>
    entry !== null && entry.generation === generation;

  return {
    prewarm() {
      if (isCurrent(warm) || isCurrent(pending)) {
        return;
      }
      start().promise.catch(() => undefined);
    },
    acquire() {
      if (warm && isCurrent(warm) && warm.scale === params.resolveScale()) {
        return Promise.resolve(warm.capture);
      }
      if (pending && isCurrent(pending)) {
        return pending.promise;
      }
      return start().promise;
    },
    dispose() {
      observer.disconnect();
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", invalidate);
      warm = null;
      pending = null;
    },
  };
}
