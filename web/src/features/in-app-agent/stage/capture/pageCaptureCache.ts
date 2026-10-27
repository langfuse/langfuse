import {
  CAPTURE_FIT_ATTRIBUTE,
  capturePage,
  type PageCapture,
} from "@/src/features/in-app-agent/stage/capture/capturePage";
import {
  ASSISTANT_STAGE_LAUNCHER_ATTRIBUTE,
  CAPTURE_EXCLUDED_SELECTORS,
} from "@/src/features/in-app-agent/stage/constants";

export type PageCaptureCache = {
  /** Starts a capture in the background unless a current one exists. */
  prewarm: () => void;
  /** A capture of the page as it is now, reusing a warm one when still valid. */
  acquire: () => Promise<PageCapture>;
  /**
   * Keeps a capture warm from now on: after the page has been quiet for a
   * moment, recaptures in idle time, yielding to the page while it works.
   */
  enableIdlePrewarm: () => void;
  dispose: () => void;
};

type Pending = {
  generation: number;
  yieldToPage: boolean;
  promise: Promise<PageCapture>;
};

/** The capture engine marks every node it inserts for its own measurements. */
const CAPTURE_ENGINE_SELECTOR = "[data-snapdom-internal]";
const IGNORED_SUBTREES = [
  ...CAPTURE_EXCLUDED_SELECTORS,
  CAPTURE_ENGINE_SELECTOR,
  // The launcher reacts to the user opening the stage; that is not the page.
  `[${ASSISTANT_STAGE_LAUNCHER_ATTRIBUTE}]`,
].join(",");
/** Attribute writes that change nothing on screen: the capture's own and the stage's. */
const IGNORED_ATTRIBUTES = new Set([CAPTURE_FIT_ATTRIBUTE, "inert"]);
const QUIET_PERIOD_MS = 1_500;
const IDLE_TIMEOUT_MS = 2_000;

function elementOf(node: Node | null) {
  return node instanceof Element ? node : (node?.parentElement ?? null);
}

function isIgnoredTarget(node: Node | null): boolean {
  return Boolean(elementOf(node)?.closest(IGNORED_SUBTREES));
}

function isPageChange(record: MutationRecord): boolean {
  // A node that already left the document (a disposed overlay canvas) is
  // not on screen; removals from the page are recorded on its parent.
  if (!record.target.isConnected) {
    return false;
  }
  if (
    record.type === "attributes" &&
    record.attributeName !== null &&
    IGNORED_ATTRIBUTES.has(record.attributeName)
  ) {
    return false;
  }
  if (isIgnoredTarget(record.target)) {
    return false;
  }
  if (record.type === "childList") {
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return !nodes.every((node) =>
      Boolean(elementOf(node)?.matches(CAPTURE_ENGINE_SELECTOR)),
    );
  }
  return true;
}

function onIdle(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => {
      window.cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(callback, 0);
  return () => {
    clearTimeout(handle);
  };
}

/**
 * Keeps at most one capture of the page and knows when it went stale: any DOM
 * change, scroll, resize or theme switch outside the transient overlays makes
 * the next `acquire` capture again. Warming on launcher hover/focus/touch, and
 * in idle time once the stage has been used, lets most opens skip the capture
 * cost entirely.
 */
export function createPageCaptureCache(params: {
  resolveScale: () => number;
}): PageCaptureCache {
  let generation = 0;
  let warm: { generation: number; scale: number; capture: PageCapture } | null =
    null;
  let pending: Pending | null = null;
  let activeCaptures = 0;
  let isIdlePrewarmEnabled = false;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelIdle: (() => void) | null = null;
  // Bound once `start` exists: idle prewarm and capture settling call each other.
  let startIdleCapture: () => void = () => undefined;
  /**
   * Text the capture engine rewrites while it measures ellipsis truncation
   * and then restores, keyed to its value before the first write. Only text
   * that ends up different once captures finish is a change to the page.
   */
  const rewrittenText = new Map<Node, string | null>();

  const isCurrent = (entry: { generation: number } | null) =>
    entry !== null && entry.generation === generation;
  // A background capture yields to the page and finishes late; someone about
  // to open the stage must not wait on it.
  const isCurrentForeground = (entry: Pending | null) =>
    isCurrent(entry) && entry?.yieldToPage === false;

  const clearIdleWork = () => {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    cancelIdle?.();
    cancelIdle = null;
  };

  const scheduleIdlePrewarm = () => {
    clearIdleWork();
    if (!isIdlePrewarmEnabled) {
      return;
    }
    quietTimer = setTimeout(() => {
      quietTimer = null;
      cancelIdle = onIdle(() => {
        cancelIdle = null;
        if (
          document.visibilityState === "visible" &&
          !isCurrent(warm) &&
          !isCurrent(pending)
        ) {
          startIdleCapture();
        }
      });
    }, QUIET_PERIOD_MS);
  };

  const invalidate = () => {
    generation += 1;
    scheduleIdlePrewarm();
  };

  const processRecords = (records: MutationRecord[]) => {
    let changed = false;
    for (const record of records) {
      if (!isPageChange(record)) {
        continue;
      }
      if (record.type === "characterData" && activeCaptures > 0) {
        if (!rewrittenText.has(record.target)) {
          rewrittenText.set(record.target, record.oldValue);
        }
        continue;
      }
      changed = true;
    }
    if (changed) {
      invalidate();
    }
  };

  const observer = new MutationObserver(processRecords);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

  /** Runs when a capture settles, before its result can become the warm one. */
  const settleRewrittenText = () => {
    processRecords(observer.takeRecords());
    if (activeCaptures > 0) {
      return;
    }
    const changed = [...rewrittenText].some(
      ([node, before]) => (node as CharacterData).data !== before,
    );
    rewrittenText.clear();
    if (changed) {
      invalidate();
    }
  };

  const start = (options: { yieldToPage: boolean }): Pending => {
    const startedGeneration = generation;
    const scale = params.resolveScale();
    activeCaptures += 1;
    const promise = capturePage(scale, options)
      .finally(() => {
        activeCaptures -= 1;
        settleRewrittenText();
        if (pending?.promise === promise) {
          pending = null;
        }
      })
      .then((capture) => {
        if (generation === startedGeneration) {
          warm = { generation: startedGeneration, scale, capture };
        }
        return capture;
      });
    pending = {
      generation: startedGeneration,
      yieldToPage: options.yieldToPage,
      promise,
    };
    return pending;
  };

  startIdleCapture = () => {
    start({ yieldToPage: true }).promise.catch(() => undefined);
  };

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

  return {
    prewarm() {
      if (isCurrent(warm) || isCurrentForeground(pending)) {
        return;
      }
      start({ yieldToPage: false }).promise.catch(() => undefined);
    },
    acquire() {
      if (warm && isCurrent(warm) && warm.scale === params.resolveScale()) {
        return Promise.resolve(warm.capture);
      }
      if (pending && isCurrentForeground(pending)) {
        return pending.promise;
      }
      return start({ yieldToPage: false }).promise;
    },
    enableIdlePrewarm() {
      if (isIdlePrewarmEnabled) {
        return;
      }
      isIdlePrewarmEnabled = true;
      scheduleIdlePrewarm();
    },
    dispose() {
      clearIdleWork();
      observer.disconnect();
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", invalidate);
      warm = null;
      pending = null;
      rewrittenText.clear();
    },
  };
}
