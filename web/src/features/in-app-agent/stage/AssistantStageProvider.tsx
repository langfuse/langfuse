import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";

import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import {
  buildRoutePageContext,
  usePageContextStore,
  type PageContextStore,
} from "@/src/features/page-context";
import {
  useInAppAiAgent,
  useIsInAppAgentLauncherVisible,
  type InAppAgentEntryPoint,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { HANDHELD_QUERY } from "@/src/hooks/use-mobile";
import {
  createPageCaptureCache,
  type PageCaptureCache,
} from "@/src/features/in-app-agent/stage/capture/pageCaptureCache";
import { resolveCaptureScale } from "@/src/features/in-app-agent/stage/capture/resolveCaptureScale";
import { AssistantStageChat } from "@/src/features/in-app-agent/stage/components/AssistantStageChat";
import { AssistantStageOverlay } from "@/src/features/in-app-agent/stage/components/AssistantStageOverlay";
import { AssistantStagePreparingIndicator } from "@/src/features/in-app-agent/stage/components/AssistantStagePreparingIndicator";
import {
  createMockStageChatStore,
  type MockStageChatStore,
} from "@/src/features/in-app-agent/stage/chat/mockStageChatStore";
import type { StageContextAttachment } from "@/src/features/in-app-agent/stage/chat/types";
import { useInAppAgentStageChat } from "@/src/features/in-app-agent/stage/chat/useInAppAgentStageChat";
import { useMockStageChat } from "@/src/features/in-app-agent/stage/chat/useMockStageChat";
import { getMaxTextureSize } from "@/src/features/in-app-agent/stage/render/createStageRenderer";
import { createThumbnailSource } from "@/src/features/in-app-agent/stage/render/drawCaptureThumbnail";
import {
  createAssistantStageStore,
  type AssistantStageEntryPoint,
  type AssistantStagePhase,
  type AssistantStageStore,
} from "@/src/features/in-app-agent/stage/state/assistantStageStore";

type AssistantStageContextValue = {
  store: AssistantStageStore;
  toggle: (entryPoint: AssistantStageEntryPoint) => void;
  close: () => void;
  /** Warms the page capture when the user shows intent to open. */
  prewarm: () => void;
};

const AssistantStageContext = createContext<AssistantStageContextValue | null>(
  null,
);

const AGENT_ENTRY_POINTS: Record<
  AssistantStageEntryPoint,
  InAppAgentEntryPoint
> = {
  top_nav: "top_nav",
  mobile_top_bar: "top_nav",
  keyboard_shortcut: "keyboard_shortcut",
};

function isShortcut(event: KeyboardEvent) {
  return (
    !event.repeat &&
    event.key.toLowerCase() === "i" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** Lazy, so no observers run until the user first shows intent. */
function createLazyCaptureCache() {
  let cache: PageCaptureCache | null = null;
  const get = () => {
    if (!cache) {
      cache = createPageCaptureCache({
        resolveScale: () =>
          resolveCaptureScale({
            cssWidth: window.innerWidth,
            cssHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
            maxTextureSize: getMaxTextureSize(),
            isHandheld: window.matchMedia(HANDHELD_QUERY).matches,
          }),
      });
    }
    return cache;
  };
  return {
    get,
    dispose() {
      cache?.dispose();
      cache = null;
    },
  };
}

function createStore(
  pageContextStore: PageContextStore | null,
  captureCache: ReturnType<typeof createLazyCaptureCache>,
) {
  return createAssistantStageStore({
    readPageContext: () =>
      pageContextStore?.getActive() ??
      buildRoutePageContext({
        path: `${window.location.pathname}${window.location.search}`,
        documentTitle: document.title,
      }),
    acquireCapture: () => {
      const cache = captureCache.get();
      // Once someone uses the stage, keep the next capture warm. Not on touch
      // screens, where the background work costs battery.
      if (window.matchMedia("(pointer: fine)").matches) {
        cache.enableIdlePrewarm();
      }
      return cache.acquire();
    },
    prewarmCapture: () => {
      captureCache.get().prewarm();
    },
    createThumbnail: createThumbnailSource,
    readViewportAspectRatio: () => window.innerWidth / window.innerHeight,
    createId: () => crypto.randomUUID(),
    now: () => new Date(),
    waitForPaint: () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      }),
  });
}

const VISIBLE_PHASES = new Set<AssistantStagePhase>([
  "opening",
  "open",
  "closing",
]);

function LiveStageChat({
  draft,
  onClose,
}: {
  draft: StageContextAttachment;
  onClose: () => void;
}) {
  const controller = useInAppAgentStageChat();
  return (
    <AssistantStageChat
      controller={controller}
      draft={draft}
      onClose={onClose}
    />
  );
}

function MockStageChat({
  store,
  draft,
  onClose,
}: {
  store: MockStageChatStore;
  draft: StageContextAttachment;
  onClose: () => void;
}) {
  const controller = useMockStageChat(store);
  return (
    <AssistantStageChat
      controller={controller}
      draft={draft}
      onClose={onClose}
    />
  );
}

function EnabledAssistantStage({ children }: { children: ReactNode }) {
  const pageContextStore = usePageContextStore();
  const { openAssistant, setOpen: setAgentOpen } = useInAppAiAgent();
  const isAssistantAvailable = useIsInAppAgentLauncherVisible();
  const [captureCache] = useState(createLazyCaptureCache);
  const [store] = useState(() => createStore(pageContextStore, captureCache));
  const [mockChatStore] = useState(() =>
    createMockStageChatStore({
      createId: () => crypto.randomUUID(),
      now: () => Date.now(),
    }),
  );
  const phase = useStore(store, (state) => state.phase);
  const session = useStore(store, (state) => state.session);

  // External system: the capture cache's observers and listeners.
  useEffect(
    () => () => {
      captureCache.dispose();
    },
    [captureCache],
  );

  const toggle = useCallback(
    (entryPoint: AssistantStageEntryPoint) => {
      const current = store.getState().phase;
      if (current === "closed" && isAssistantAvailable) {
        // Also opens the assistant session: hydration, attach, and the
        // dialog that turns AI features on when an organization has them off.
        if (!openAssistant(AGENT_ENTRY_POINTS[entryPoint])) {
          return;
        }
      } else if (current !== "closing" && isAssistantAvailable) {
        setAgentOpen(false);
      }
      store.getState().actions.toggle(entryPoint);
    },
    [isAssistantAvailable, openAssistant, setAgentOpen, store],
  );

  const close = useCallback(() => {
    if (isAssistantAvailable) {
      setAgentOpen(false);
    }
    store.getState().actions.close();
  }, [isAssistantAvailable, setAgentOpen, store]);

  const value = useMemo<AssistantStageContextValue>(
    () => ({
      store,
      toggle,
      close,
      prewarm: () => {
        store.getState().actions.prewarm();
      },
    }),
    [close, store, toggle],
  );

  const isCovering = VISIBLE_PHASES.has(phase);

  // External system: keyboard events. While the stage covers the page it owns
  // Escape, at the window's capture phase, before overlays of the hidden page
  // (a trace peek listens on the document) could dismiss themselves too.
  useEffect(() => {
    if (!isCovering) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [close, isCovering]);

  // External system: the global keyboard shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcut(event)) {
        event.preventDefault();
        toggle("keyboard_shortcut");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toggle]);

  return (
    <AssistantStageContext.Provider value={value}>
      {children}
      {phase === "preparing" ? <AssistantStagePreparingIndicator /> : null}
      {session && isCovering ? (
        <AssistantStageOverlay key={session.id} store={store} session={session}>
          {isAssistantAvailable ? (
            <LiveStageChat
              draft={{
                context: session.context,
                thumbnail: session.thumbnail,
                aspectRatio: session.aspectRatio,
              }}
              onClose={close}
            />
          ) : (
            <MockStageChat
              store={mockChatStore}
              draft={{
                context: session.context,
                thumbnail: session.thumbnail,
                aspectRatio: session.aspectRatio,
              }}
              onClose={close}
            />
          )}
        </AssistantStageOverlay>
      ) : null}
    </AssistantStageContext.Provider>
  );
}

/**
 * Opt-in presentation of the assistant in which the page the user is on
 * becomes the first message. When enabled it replaces the floating window's
 * entry points; the assistant backend stays the same, or a mocked responder
 * when the deployment has none.
 */
export function AssistantStageProvider({ children }: { children: ReactNode }) {
  const isEnabled = useIsFeatureEnabled("assistantContextZoom");
  const { query } = useRouter();
  const projectId =
    typeof query.projectId === "string" ? query.projectId : undefined;

  if (!isEnabled || !projectId) {
    return children;
  }
  return (
    <EnabledAssistantStage key={projectId}>{children}</EnabledAssistantStage>
  );
}

/** Null when the stage is not enabled for this user and page. */
export function useAssistantStage() {
  return useContext(AssistantStageContext);
}

const CLOSED_STORE = createStore(null, createLazyCaptureCache());

/** The stage's phase, for launchers that reflect whether it is open. */
export function useAssistantStagePhase(): AssistantStagePhase {
  const stage = useContext(AssistantStageContext);
  return useStore(stage?.store ?? CLOSED_STORE, (state) => state.phase);
}
