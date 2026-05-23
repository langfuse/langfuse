import { GlimmProvider, useGlimm, type SweepFn } from "glimm/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  captureRouteSnapshot,
  getRouteLayerTextSignature,
  type SpielwieseRouteSnapshot,
} from "./spielwieseRouteTransitionSnapshot";
import {
  glimmRouteTransitionDefaults,
  routeTransitionCleanupFallbackMs,
  routeTransitionCleanupPollMs,
  routeTransitionCrossfadeMs,
  routeTransitionNavigateDelayMs,
  routeTransitionVisualFallbackMs,
  waitForRouteTransitionSignal,
} from "./spielwieseRouteTransitionConfig";
import { routeRevealCss } from "./spielwieseRouteTransitionStyles";

type SpielwieseRouteTransitionNavigate = () => Promise<unknown> | void;
type SpielwieseRouteTransitionPhase = "idle" | "revealing" | "sweeping";

type SpielwieseRouteTransitionContextValue = {
  isActive: boolean;
  start: (navigate: SpielwieseRouteTransitionNavigate) => void;
};

type RouteTransitionStateSetters = {
  routeLayerRef: RefObject<HTMLDivElement | null>;
  setPhase: Dispatch<SetStateAction<SpielwieseRouteTransitionPhase>>;
  setRouteSnapshot: Dispatch<SetStateAction<SpielwieseRouteSnapshot | null>>;
  transitionIdRef: RefObject<number>;
};

type RouteTransitionCleanup = {
  clearTransition: (transitionId: number) => void;
  clearTransitionAfterRouteSwap: (
    transitionId: number,
    snapshot: SpielwieseRouteSnapshot | null,
  ) => void;
};
type RouteTransitionStartOptions = RouteTransitionStateSetters &
  RouteTransitionCleanup & { sweep: SweepFn };

const fallbackRouteTransitionContext: SpielwieseRouteTransitionContextValue = {
  isActive: false,
  start: (navigate) => {
    void Promise.resolve(navigate());
  },
};

const SpielwieseRouteTransitionContext =
  createContext<SpielwieseRouteTransitionContextValue>(
    fallbackRouteTransitionContext,
  );

export function useSpielwieseRouteTransition() {
  return useContext(SpielwieseRouteTransitionContext);
}

function useRouteTransitionCleanup(
  options: RouteTransitionStateSetters,
): RouteTransitionCleanup {
  const { routeLayerRef, setPhase, setRouteSnapshot, transitionIdRef } =
    options;
  const clearTransition = useCallback(
    (transitionId: number) => {
      if (transitionIdRef.current !== transitionId) {
        return;
      }

      setPhase("idle");
      setRouteSnapshot(null);
    },
    [setPhase, setRouteSnapshot, transitionIdRef],
  );

  const clearTransitionAfterRouteSwap = useCallback(
    (transitionId: number, snapshot: SpielwieseRouteSnapshot | null) => {
      const startedAt = Date.now();
      const waitForRouteSwap = () => {
        const currentSignature = getRouteLayerTextSignature(
          routeLayerRef.current,
        );
        const hasRouteSwapped =
          !snapshot || currentSignature !== snapshot.textSignature;
        const hasTimedOut =
          Date.now() - startedAt >= routeTransitionCleanupFallbackMs;

        if (hasRouteSwapped || hasTimedOut) {
          window.setTimeout(() => {
            clearTransition(transitionId);
          }, routeTransitionCrossfadeMs);
          return;
        }

        window.setTimeout(waitForRouteSwap, routeTransitionCleanupPollMs);
      };

      waitForRouteSwap();
    },
    [clearTransition, routeLayerRef],
  );

  return {
    clearTransition,
    clearTransitionAfterRouteSwap,
  };
}

function useRouteTransitionStart(options: RouteTransitionStartOptions) {
  const {
    clearTransition,
    clearTransitionAfterRouteSwap,
    routeLayerRef,
    setPhase,
    setRouteSnapshot,
    sweep,
    transitionIdRef,
  } = options;
  const start = useCallback(
    (navigate: SpielwieseRouteTransitionNavigate) => {
      const transitionId = transitionIdRef.current + 1;
      const snapshot = captureRouteSnapshot(
        routeLayerRef.current,
        transitionId,
      );

      transitionIdRef.current = transitionId;
      setRouteSnapshot(snapshot);
      setPhase("sweeping");

      const handle = sweep(() => undefined);
      const startNavigation = () => {
        if (transitionIdRef.current !== transitionId) {
          return;
        }

        void Promise.resolve(navigate())
          .then(() => {
            if (transitionIdRef.current === transitionId) {
              setPhase("revealing");
            }
          })
          .catch(() => {
            clearTransition(transitionId);
          });
      };

      void waitForRouteTransitionSignal(
        handle.midpoint,
        routeTransitionNavigateDelayMs,
      ).then(startNavigation);

      void waitForRouteTransitionSignal(
        handle.done,
        routeTransitionVisualFallbackMs,
      ).finally(() => {
        clearTransitionAfterRouteSwap(transitionId, snapshot);
      });
    },
    [
      clearTransition,
      clearTransitionAfterRouteSwap,
      routeLayerRef,
      setPhase,
      setRouteSnapshot,
      sweep,
      transitionIdRef,
    ],
  );

  return start;
}

function useRouteTransitionState(sweep: SweepFn) {
  const routeLayerRef = useRef<HTMLDivElement | null>(null);
  const transitionIdRef = useRef(0);
  const [phase, setPhase] = useState<SpielwieseRouteTransitionPhase>("idle");
  const [routeSnapshot, setRouteSnapshot] =
    useState<SpielwieseRouteSnapshot | null>(null);
  const stateSetters = {
    routeLayerRef,
    setPhase,
    setRouteSnapshot,
    transitionIdRef,
  };
  const cleanup = useRouteTransitionCleanup(stateSetters);
  const start = useRouteTransitionStart({
    ...stateSetters,
    ...cleanup,
    sweep,
  });

  const contextValue = useMemo<SpielwieseRouteTransitionContextValue>(
    () => ({
      isActive: phase !== "idle",
      start,
    }),
    [phase, start],
  );

  return {
    contextValue,
    phase,
    routeLayerRef,
    routeSnapshot,
  };
}

function SpielwieseRouteTransitionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const { sweep } = useGlimm();
  const { contextValue, phase, routeLayerRef, routeSnapshot } =
    useRouteTransitionState(sweep);

  return (
    <SpielwieseRouteTransitionContext.Provider value={contextValue}>
      <style>{routeRevealCss}</style>
      <div
        className="spielwiese-route-transition-stage"
        data-route-transition-phase={phase}
        data-testid="spielwiese-route-transition-stage"
      >
        {routeSnapshot ? (
          <div
            aria-hidden="true"
            className="spielwiese-route-transition-snapshot"
            data-route-transition-phase={phase}
            data-testid="spielwiese-route-transition-snapshot"
            key={routeSnapshot.id}
          >
            <div
              className="spielwiese-route-transition-snapshot-inner"
              dangerouslySetInnerHTML={{ __html: routeSnapshot.html }}
            />
          </div>
        ) : null}
        <div
          className="spielwiese-route-transition-live"
          data-route-transition-phase={phase}
          data-testid="spielwiese-route-transition-live"
          ref={routeLayerRef}
        >
          {children}
        </div>
      </div>
    </SpielwieseRouteTransitionContext.Provider>
  );
}

export function SpielwieseRouteTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <GlimmProvider {...glimmRouteTransitionDefaults}>
      <SpielwieseRouteTransitionBoundary>
        {children}
      </SpielwieseRouteTransitionBoundary>
    </GlimmProvider>
  );
}
