import { createStore } from "zustand/vanilla";

import type {
  CapturedPageContext,
  PageContextSnapshot,
} from "@/src/features/page-context";
import type { PageCapture } from "@/src/features/in-app-agent/stage/capture/capturePage";

export type AssistantStageEntryPoint =
  | "top_nav"
  | "mobile_top_bar"
  | "keyboard_shortcut";

/**
 * - `preparing`: the page is being captured; nothing is on screen yet.
 * - `opening` / `closing`: the flight between page and chat is running.
 *   Either can be reversed mid-flight.
 */
export type AssistantStagePhase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "closing";

export type AssistantStageSession = {
  id: string;
  /** Structured page context, frozen when the user asked to open. */
  context: CapturedPageContext;
  /** Pixels of the page; null when capturing failed, which skips the flight. */
  capture: PageCapture | null;
  /** Small copy of the capture for the message bubble. */
  thumbnail: HTMLCanvasElement | null;
  /** Width / height of the viewport at the moment of intent. */
  aspectRatio: number;
  entryPoint: AssistantStageEntryPoint;
  returnFocusTo: HTMLElement | null;
};

export type AssistantStageState = {
  phase: AssistantStagePhase;
  session: AssistantStageSession | null;
  actions: {
    open: (entryPoint: AssistantStageEntryPoint) => Promise<void>;
    close: () => void;
    toggle: (entryPoint: AssistantStageEntryPoint) => void;
    markOpened: () => void;
    markClosed: () => void;
    prewarm: () => void;
  };
};

export type AssistantStageDependencies = {
  readPageContext: () => PageContextSnapshot;
  acquireCapture: () => Promise<PageCapture>;
  prewarmCapture: () => void;
  createThumbnail: (capture: PageCapture) => HTMLCanvasElement;
  readViewportAspectRatio: () => number;
  createId: () => string;
  now: () => Date;
  onOpen?: (entryPoint: AssistantStageEntryPoint) => void;
  onCaptureFailed?: (error: unknown) => void;
};

function currentFocus(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
    ? document.activeElement
    : null;
}

export function createAssistantStageStore(deps: AssistantStageDependencies) {
  return createStore<AssistantStageState>()((set, get) => {
    const open = async (entryPoint: AssistantStageEntryPoint) => {
      const { phase } = get();
      if (phase === "closing") {
        set({ phase: "opening" });
        return;
      }
      if (phase !== "closed") {
        return;
      }

      // Read the context at the moment of intent, before the capture yields.
      const session: AssistantStageSession = {
        id: deps.createId(),
        context: {
          ...deps.readPageContext(),
          capturedAt: deps.now().toISOString(),
        },
        capture: null,
        thumbnail: null,
        aspectRatio: deps.readViewportAspectRatio(),
        entryPoint,
        returnFocusTo: currentFocus(),
      };
      set({ phase: "preparing", session });
      deps.onOpen?.(entryPoint);

      let capture: PageCapture | null = null;
      try {
        capture = await deps.acquireCapture();
      } catch (error) {
        deps.onCaptureFailed?.(error);
      }

      const latest = get();
      if (latest.phase !== "preparing" || latest.session?.id !== session.id) {
        return;
      }
      set({
        phase: "opening",
        session: {
          ...session,
          capture,
          thumbnail: capture ? deps.createThumbnail(capture) : null,
          aspectRatio: capture
            ? capture.cssWidth / capture.cssHeight
            : session.aspectRatio,
        },
      });
    };

    const close = () => {
      const { phase } = get();
      if (phase === "preparing") {
        set({ phase: "closed", session: null });
        return;
      }
      if (phase === "opening" || phase === "open") {
        set({ phase: "closing" });
      }
    };

    return {
      phase: "closed",
      session: null,
      actions: {
        open,
        close,
        toggle(entryPoint) {
          const { phase } = get();
          if (phase === "closed" || phase === "closing") {
            open(entryPoint).catch(() => undefined);
            return;
          }
          close();
        },
        markOpened() {
          if (get().phase === "opening") {
            set({ phase: "open" });
          }
        },
        markClosed() {
          const { phase, session } = get();
          if (phase !== "closing") {
            return;
          }
          set({ phase: "closed", session: null });
          if (session?.returnFocusTo?.isConnected) {
            session.returnFocusTo.focus({ preventScroll: true });
          }
        },
        prewarm() {
          if (get().phase === "closed") {
            deps.prewarmCapture();
          }
        },
      },
    };
  });
}

export type AssistantStageStore = ReturnType<typeof createAssistantStageStore>;
