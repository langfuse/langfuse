import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useStore } from "zustand";

import { Layer } from "@/src/components/design-system/Layer/Layer";
import { useIsHandheld } from "@/src/hooks/use-mobile";
import { useVisibleViewportAnchoring } from "@/src/hooks/useVisibleViewportAnchoring";
import { ASSISTANT_STAGE_ROOT_ATTRIBUTE } from "@/src/features/in-app-agent/stage/constants";
import {
  createStageFlight,
  type StageFlight,
} from "@/src/features/in-app-agent/stage/motion/stageFlight";
import type { StageRendererPreference } from "@/src/features/in-app-agent/stage/render/createStageRenderer";
import type {
  AssistantStageSession,
  AssistantStageStore,
} from "@/src/features/in-app-agent/stage/state/assistantStageStore";

function readRendererPreference(): StageRendererPreference {
  return new URLSearchParams(window.location.search).get(
    "assistantStageRenderer",
  ) === "css"
    ? "css"
    : "webgl";
}

function focusComposer(chat: HTMLElement | null) {
  chat
    ?.querySelector<HTMLTextAreaElement>("[data-stage-composer-input]")
    ?.focus({ preventScroll: true });
}

function useStageFlight(params: {
  session: AssistantStageSession;
  store: AssistantStageStore;
  flightRef: RefObject<StageFlight | null>;
  backdropRef: RefObject<HTMLDivElement | null>;
  chatRef: RefObject<HTMLDivElement | null>;
  rendererHostRef: RefObject<HTMLDivElement | null>;
}) {
  const { session, store, flightRef, backdropRef, chatRef, rendererHostRef } =
    params;

  // External system: the flight owns DOM styles, a rAF loop and GPU memory;
  // it is created per session and torn down with the overlay.
  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const chat = chatRef.current;
    const rendererHost = rendererHostRef.current;
    if (!backdrop || !chat || !rendererHost) {
      return;
    }
    const flight = createStageFlight({
      elements: { backdrop, chat, rendererHost },
      capture: session.capture,
      prefersReducedMotion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
      rendererPreference: readRendererPreference(),
      onOpened: () => {
        store.getState().actions.markOpened();
        // On touch screens, focusing would raise the keyboard over the landing.
        if (!window.matchMedia("(pointer: coarse)").matches) {
          focusComposer(chat);
        }
      },
      onClosed: () => {
        store.getState().actions.markClosed();
      },
    });
    flightRef.current = flight;
    return () => {
      flight.dispose();
      flightRef.current = null;
    };
  }, [
    backdropRef,
    chatRef,
    flightRef,
    rendererHostRef,
    session.capture,
    session.id,
    store,
  ]);
}

/**
 * Full-screen surface in the `agent` layer: an opaque backdrop, the chat, and
 * the renderer that draws the captured page above both. The live page stays
 * mounted and untouched underneath, made inert while covered.
 */
export function AssistantStageOverlay({
  store,
  session,
  onRequestClose,
  children,
}: {
  store: AssistantStageStore;
  session: AssistantStageSession;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const phase = useStore(store, (state) => state.phase);
  const isHandheld = useIsHandheld();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const rendererHostRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<StageFlight | null>(null);

  useVisibleViewportAnchoring(root, isHandheld && phase === "open");
  useStageFlight({
    session,
    store,
    flightRef,
    backdropRef,
    chatRef,
    rendererHostRef,
  });

  // External system: the flight's rAF loop and WebGL canvas. Runs before
  // paint so the first visible frame is already the texture over the page.
  useLayoutEffect(() => {
    if (phase === "opening") {
      flightRef.current?.open();
    } else if (phase === "closing") {
      flightRef.current?.close();
    }
  }, [phase]);

  return (
    <Layer name="agent">
      <div
        ref={setRoot}
        {...{ [ASSISTANT_STAGE_ROOT_ATTRIBUTE]: "" }}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant"
        className="fixed inset-0 overflow-hidden"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            onRequestClose();
          }
        }}
      >
        <div
          ref={backdropRef}
          className="bg-background top-banner-offset absolute inset-x-0 bottom-0"
          style={{ opacity: 0 }}
        />
        <div
          ref={chatRef}
          className="pt-banner-offset absolute inset-0 origin-top-left will-change-transform"
          style={{ opacity: 0 }}
        >
          {children}
        </div>
        <div ref={rendererHostRef} className="pointer-events-none" />
      </div>
    </Layer>
  );
}
