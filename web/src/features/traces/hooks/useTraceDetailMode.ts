import { useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { type ObservationType } from "@langfuse/shared";

import {
  getDefaultObservationId,
  getSelectedObservation,
  getTraceDetailModeTitle,
} from "@/src/features/traces/fns/getSelectedObservationType";

export type TraceDetailMode = "trace" | "session" | "observation";

export function parseTraceDetailMode(value: unknown): TraceDetailMode {
  return value === "session" || value === "observation" ? value : "trace";
}

type TraceDetailModeData = {
  id: string;
  name?: string | null;
  sessionId?: string | null;
  rootObservationId?: string | null;
  observations?: ReadonlyArray<{
    id: string;
    name?: string | null;
    traceId?: string | null;
    type: ObservationType;
  }>;
};

export function useTraceDetailMode({
  trace,
  fallbackFromUnavailableSession = false,
}: {
  trace: TraceDetailModeData | undefined;
  fallbackFromUnavailableSession?: boolean;
}) {
  const router = useRouter();
  const requestedMode = parseTraceDetailMode(router.query.aggregation);
  const mode =
    requestedMode === "session" && fallbackFromUnavailableSession
      ? "trace"
      : requestedMode;
  const selectedNodeId =
    typeof router.query.observation === "string"
      ? router.query.observation
      : undefined;
  const selectedObservation = getSelectedObservation(
    trace?.observations,
    selectedNodeId,
  );

  const setMode = useCallback(
    (nextMode: TraceDetailMode) => {
      const query = { ...router.query };
      if (nextMode === "trace") {
        delete query.aggregation;
      } else {
        query.aggregation = nextMode;
      }
      if (nextMode === "observation" && !selectedObservation) {
        const defaultObservationId = getDefaultObservationId(trace);
        if (defaultObservationId) query.observation = defaultObservationId;
      }
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    },
    [router, selectedObservation, trace],
  );

  useEffect(() => {
    if (requestedMode !== "session" || !fallbackFromUnavailableSession) return;
    setMode("trace");
  }, [fallbackFromUnavailableSession, requestedMode, setMode]);

  return {
    mode,
    requestedMode,
    selectedNodeId,
    selectedObservation,
    setMode,
    title: getTraceDetailModeTitle(
      mode,
      trace,
      selectedObservation,
      mode === "observation" ? selectedNodeId : trace?.id,
    ),
    widthMode:
      mode === "observation" ? ("observation" as const) : ("split" as const),
  };
}
