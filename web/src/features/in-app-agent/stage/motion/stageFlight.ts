import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";
import {
  ASSISTANT_STAGE_TIMINGS,
  CONTEXT_THUMBNAIL_RADIUS_PX,
} from "@/src/features/in-app-agent/stage/constants";
import {
  easeStageClose,
  easeStageOpen,
} from "@/src/features/in-app-agent/stage/motion/cubicBezier";
import {
  createStageCamera,
  stageFrameAt,
  type StageCamera,
} from "@/src/features/in-app-agent/stage/motion/stageCamera";
import { createStageTransition } from "@/src/features/in-app-agent/stage/motion/stageTransition";
import {
  createStageRenderer,
  type StageRendererPreference,
} from "@/src/features/in-app-agent/stage/render/createStageRenderer";
import type { StageRenderer } from "@/src/features/in-app-agent/stage/render/stageRenderer";

export const STAGE_SLOT_SELECTOR = "[data-stage-slot='true']";

export type StageFlightElements = {
  backdrop: HTMLElement;
  chat: HTMLElement;
  rendererHost: HTMLElement;
};

export type StageFlight = {
  open: () => void;
  close: () => void;
  dispose: () => void;
};

/** Keyboard heights below this are browser chrome, not a keyboard. */
const KEYBOARD_THRESHOLD_PX = 80;
const KEYBOARD_SETTLE_TIMEOUT_MS = 450;

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function isKeyboardOpen() {
  const viewport = window.visualViewport;
  return Boolean(
    viewport && window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX,
  );
}

/**
 * Dismisses the on-screen keyboard before measuring: while it animates away
 * the chat re-lays out, which would move the bubble under a running flight.
 */
async function settleKeyboard(chat: HTMLElement) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !chat.contains(active)) {
    return;
  }
  const wasOpen = isKeyboardOpen();
  active.blur();
  const viewport = window.visualViewport;
  if (!wasOpen || !viewport) {
    return;
  }
  await new Promise<void>((resolve) => {
    const listener = {
      timeout: 0 as ReturnType<typeof setTimeout> | 0,
      done() {
        clearTimeout(listener.timeout);
        viewport.removeEventListener("resize", listener.onResize);
        resolve();
      },
      onResize() {
        if (!isKeyboardOpen()) {
          listener.done();
        }
      },
    };
    listener.timeout = setTimeout(listener.done, KEYBOARD_SETTLE_TIMEOUT_MS);
    viewport.addEventListener("resize", listener.onResize);
  });
  await nextFrame();
}

function setPageInert(isInert: boolean) {
  const targets = [
    document.getElementById("__next"),
    document.querySelector("[data-overlay-root] > [data-layer='panel']"),
  ];
  for (const target of targets) {
    if (!target) {
      continue;
    }
    if (isInert) {
      target.setAttribute("inert", "");
    } else {
      target.removeAttribute("inert");
    }
  }
}

function fade(
  element: HTMLElement,
  from: number,
  to: number,
  durationMs: number,
) {
  element.style.opacity = String(to);
  return element.animate([{ opacity: from }, { opacity: to }], {
    duration: durationMs,
    easing: "ease-out",
  });
}

/**
 * Runs the camera flight between the live page and the chat. It owns
 * everything imperative: the renderer and its GPU memory, the page's `inert`
 * state, and the hand-offs at both ends, where the flying texture is swapped
 * for the live page or for the bubble thumbnail on a frame where they
 * coincide. The live page is never moved or re-rendered.
 */
export function createStageFlight(params: {
  elements: StageFlightElements;
  capture: PageCapture | null;
  prefersReducedMotion: boolean;
  rendererPreference: StageRendererPreference;
  onOpened: () => void;
  onClosed: () => void;
}): StageFlight {
  const { backdrop, chat, rendererHost } = params.elements;
  const { capture } = params;
  let renderer: StageRenderer | null = null;
  let camera: StageCamera | null = null;
  let handoff: Animation | null = null;
  let direction: "opening" | "closing" | "idle" = "idle";
  let disposed = false;

  const slot = () => chat.querySelector<HTMLElement>(STAGE_SLOT_SELECTOR);

  const setSlotVisible = (isVisible: boolean) => {
    const element = slot();
    if (element) {
      element.style.visibility = isVisible ? "" : "hidden";
    }
  };

  const apply = (progress: number) => {
    if (!camera) {
      return;
    }
    const frame = stageFrameAt(camera, progress, CONTEXT_THUMBNAIL_RADIUS_PX);
    renderer?.render(frame);
    chat.style.transform = frame.chatTransform;
    chat.style.opacity = String(frame.chatOpacity);
  };
  const transition = createStageTransition(apply);

  const disposeRenderer = () => {
    handoff?.cancel();
    handoff = null;
    renderer?.dispose();
    renderer = null;
  };

  const ensureRenderer = (preference: StageRendererPreference) => {
    if (renderer || !capture) {
      return renderer;
    }
    renderer = createStageRenderer({
      capture,
      preference,
      onContextLost: () => {
        // A lost GPU context mid-flight continues on the CSS renderer.
        disposeRenderer();
        ensureRenderer("css");
        apply(transition.getProgress());
      },
    });
    rendererHost.appendChild(renderer.element);
    return renderer;
  };

  const cancelHandoff = () => {
    if (handoff) {
      handoff.cancel();
      handoff = null;
    }
    if (renderer) {
      renderer.element.style.opacity = "1";
    }
  };

  /** The camera into the slot as currently laid out; the chat must be at rest. */
  const measureCamera = (): StageCamera | null => {
    const target = slot();
    if (
      !capture ||
      !target ||
      params.prefersReducedMotion ||
      Math.abs(window.innerWidth - capture.cssWidth) > 1 ||
      Math.abs(window.innerHeight - capture.cssHeight) > 1
    ) {
      return null;
    }
    chat.style.transform = "";
    const rect = target.getBoundingClientRect();
    return createStageCamera(
      { width: capture.cssWidth, height: capture.cssHeight },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    );
  };

  const landOpen = () => {
    direction = "idle";
    chat.style.transform = "";
    chat.style.opacity = "";
    setSlotVisible(true);
    const element = renderer?.element;
    if (element) {
      handoff = fade(element, 1, 0, ASSISTANT_STAGE_TIMINGS.handoffMs);
      handoff.onfinish = () => {
        disposeRenderer();
      };
    }
    params.onOpened();
  };

  const landClosed = () => {
    direction = "idle";
    backdrop.style.opacity = "0";
    chat.style.opacity = "0";
    setPageInert(false);
    const element = renderer?.element;
    if (!element) {
      params.onClosed();
      return;
    }
    handoff = fade(element, 1, 0, ASSISTANT_STAGE_TIMINGS.handoffMs);
    handoff.onfinish = () => {
      disposeRenderer();
      params.onClosed();
    };
  };

  const fly = (target: 0 | 1) => {
    direction = target === 1 ? "opening" : "closing";
    setSlotVisible(false);
    transition
      .animateTo(target, {
        durationMs:
          target === 1
            ? ASSISTANT_STAGE_TIMINGS.openMs
            : ASSISTANT_STAGE_TIMINGS.closeMs,
        ease: target === 1 ? easeStageOpen : easeStageClose,
      })
      .then((result) => {
        if (result !== "finished" || disposed) {
          return;
        }
        if (target === 1) {
          landOpen();
        } else {
          landClosed();
        }
      })
      .catch(() => undefined);
  };

  const crossfade = (target: 0 | 1) => {
    direction = target === 1 ? "opening" : "closing";
    const animation = fade(
      chat,
      target === 1 ? 0 : 1,
      target,
      ASSISTANT_STAGE_TIMINGS.reducedMotionMs,
    );
    fade(
      backdrop,
      target === 1 ? 0 : 1,
      target,
      ASSISTANT_STAGE_TIMINGS.reducedMotionMs,
    );
    animation.onfinish = () => {
      if (disposed) {
        return;
      }
      direction = "idle";
      if (target === 1) {
        params.onOpened();
      } else {
        setPageInert(false);
        params.onClosed();
      }
    };
  };

  return {
    open() {
      setPageInert(true);
      if (direction === "closing" && camera && renderer) {
        cancelHandoff();
        fly(1);
        return;
      }
      camera = measureCamera();
      if (!camera) {
        crossfade(1);
        return;
      }
      ensureRenderer(params.rendererPreference);
      backdrop.style.opacity = "1";
      transition.jumpTo(0);
      fly(1);
    },
    close() {
      if (direction === "opening" && camera) {
        if (!renderer) {
          ensureRenderer(params.rendererPreference);
        }
        cancelHandoff();
        fly(0);
        return;
      }
      settleKeyboard(chat)
        .then(() => {
          if (disposed) {
            return;
          }
          cancelHandoff();
          camera = measureCamera();
          if (!camera) {
            crossfade(0);
            return;
          }
          ensureRenderer(params.rendererPreference);
          transition.jumpTo(1);
          fly(0);
        })
        .catch(() => undefined);
    },
    dispose() {
      disposed = true;
      transition.cancel();
      disposeRenderer();
      setPageInert(false);
    },
  };
}
