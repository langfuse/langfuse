import type { ObservationLevelType } from "@langfuse/shared";

import {
  fact,
  fitPageContextSnapshot,
  formatEntityTypeLabel,
  truncateText,
} from "@/src/features/page-context/fns/pageContextFormatting";
import {
  PAGE_CONTEXT_LIMITS,
  type PageContextEntity,
  type PageContextFact,
  type PageContextRelatedEntity,
  type PageContextSnapshot,
  type PageContextSurface,
} from "@/src/features/page-context/types";
import {
  compactNumberFormatter,
  costFormatter,
  latencyFormatter,
} from "@/src/utils/numbers";

export type TraceForPageContext = {
  id: string;
  name: string | null;
  environment: string;
  tags: string[];
  sessionId: string | null;
  userId: string | null;
  /** Seconds, as the trace view receives it. */
  latency?: number;
};

export type ObservationForPageContext = {
  id: string;
  name: string | null;
  type: string;
  startTime: Date;
  endTime: Date | null;
  level: ObservationLevelType;
  model: string | null;
  statusMessage: string | null;
  totalCost: number | null;
  totalUsage: number;
};

/** A step spanning nearly the whole trace is its wrapper, not a slow step. */
const WRAPPER_DURATION_SHARE = 0.95;
const MAX_SLOW_STEPS = 2;
const MAX_ERROR_STEPS = 2;

function observationDurationMs(observation: ObservationForPageContext) {
  return observation.endTime
    ? observation.endTime.getTime() - observation.startTime.getTime()
    : undefined;
}

function observationFacts(
  observation: ObservationForPageContext,
  traceDurationMs: number | undefined,
): PageContextFact[] {
  const facts: PageContextFact[] = [];
  const durationMs = observationDurationMs(observation);
  if (durationMs !== undefined) {
    const share =
      traceDurationMs && traceDurationMs > 0
        ? ` (${Math.round((durationMs / traceDurationMs) * 100)}%)`
        : "";
    facts.push(
      fact(
        "latency_ms",
        "Latency",
        `${latencyFormatter(durationMs)}${share}`,
        durationMs,
      ),
    );
  }
  if (observation.totalCost) {
    facts.push(
      fact(
        "cost_usd",
        "Cost",
        costFormatter(observation.totalCost),
        observation.totalCost,
      ),
    );
  }
  if (observation.totalUsage > 0) {
    facts.push(
      fact(
        "tokens",
        "Tokens",
        compactNumberFormatter(observation.totalUsage),
        observation.totalUsage,
      ),
    );
  }
  if (observation.model) {
    facts.push(fact("model", "Model", observation.model, observation.model));
  }
  if (observation.level !== "DEFAULT") {
    facts.push(
      fact(
        "level",
        "Level",
        formatEntityTypeLabel(observation.level),
        observation.level,
      ),
    );
  }
  if (observation.statusMessage) {
    facts.push(fact("status_message", "Status", observation.statusMessage));
  }
  return facts.slice(0, PAGE_CONTEXT_LIMITS.facts);
}

function observationEntity(
  observation: ObservationForPageContext,
  traceDurationMs: number | undefined,
): PageContextEntity {
  return {
    kind: "observation",
    label: formatEntityTypeLabel(observation.type),
    id: observation.id,
    title: truncateText(
      observation.name ?? "Unnamed observation",
      PAGE_CONTEXT_LIMITS.title,
    ),
    facts: observationFacts(observation, traceDurationMs),
  };
}

function pickRelatedObservations(
  observations: readonly ObservationForPageContext[],
  traceDurationMs: number | undefined,
  excludeId: string | undefined,
): PageContextRelatedEntity[] {
  const related: PageContextRelatedEntity[] = [];
  const seen = new Set<string>(excludeId ? [excludeId] : []);
  const add = (observation: ObservationForPageContext, reason: string) => {
    if (seen.has(observation.id)) {
      return;
    }
    seen.add(observation.id);
    related.push({
      ...observationEntity(observation, traceDurationMs),
      reason,
    });
  };

  for (const observation of observations) {
    if (related.length >= MAX_ERROR_STEPS) {
      break;
    }
    if (observation.level === "ERROR") {
      add(observation, "error");
    }
  }

  const slowSteps = observations
    .flatMap((observation) => {
      const durationMs = observationDurationMs(observation);
      if (durationMs === undefined || seen.has(observation.id)) {
        return [];
      }
      if (
        traceDurationMs &&
        durationMs >= traceDurationMs * WRAPPER_DURATION_SHARE
      ) {
        return [];
      }
      return [{ observation, durationMs }];
    })
    .toSorted((a, b) => b.durationMs - a.durationMs)
    .slice(0, MAX_SLOW_STEPS);
  for (const { observation } of slowSteps) {
    add(observation, "slowest step");
  }

  let mostExpensive: ObservationForPageContext | undefined;
  for (const observation of observations) {
    if (
      (observation.totalCost ?? 0) > 0 &&
      (observation.totalCost ?? 0) > (mostExpensive?.totalCost ?? 0)
    ) {
      mostExpensive = observation;
    }
  }
  if (mostExpensive) {
    add(mostExpensive, "most expensive step");
  }

  return related.slice(0, PAGE_CONTEXT_LIMITS.related);
}

/**
 * The trace view's structured context: headline metrics for the chip, the
 * selected observation, and the steps an assistant most likely needs (errors,
 * the slowest steps, the most expensive step).
 */
export function buildTracePageContext(params: {
  trace: TraceForPageContext;
  observations: readonly ObservationForPageContext[];
  totals: { totalCostUsd?: number; durationMs?: number };
  selectedObservationId: string | null;
  surface: PageContextSurface;
  path: string;
}): PageContextSnapshot {
  const { trace, observations, totals } = params;
  const durationMs =
    totals.durationMs ??
    (trace.latency !== undefined ? trace.latency * 1000 : undefined);
  const totalTokens = observations.reduce(
    (sum, observation) => sum + observation.totalUsage,
    0,
  );
  const errorCount = observations.filter(
    (observation) => observation.level === "ERROR",
  ).length;

  const facts: PageContextFact[] = [];
  if (durationMs !== undefined) {
    facts.push(
      fact("latency_ms", "Latency", latencyFormatter(durationMs), durationMs),
    );
  }
  if (totals.totalCostUsd !== undefined) {
    facts.push(
      fact(
        "cost_usd",
        "Cost",
        costFormatter(totals.totalCostUsd),
        totals.totalCostUsd,
      ),
    );
  }
  facts.push(
    fact(
      "observations",
      "Observations",
      String(observations.length),
      observations.length,
    ),
  );
  if (totalTokens > 0) {
    facts.push(
      fact(
        "tokens",
        "Tokens",
        compactNumberFormatter(totalTokens),
        totalTokens,
      ),
    );
  }
  if (errorCount > 0) {
    facts.push(fact("errors", "Errors", String(errorCount), errorCount));
  }
  if (trace.environment && trace.environment !== "default") {
    facts.push(
      fact("environment", "Environment", trace.environment, trace.environment),
    );
  }
  if (trace.sessionId) {
    facts.push(fact("session_id", "Session", trace.sessionId, trace.sessionId));
  }
  if (trace.userId) {
    facts.push(fact("user_id", "User", trace.userId, trace.userId));
  }
  if (trace.tags.length > 0) {
    facts.push(fact("tags", "Tags", trace.tags.join(", ")));
  }

  const selectedObservation = params.selectedObservationId
    ? observations.find(
        (observation) => observation.id === params.selectedObservationId,
      )
    : undefined;

  const related = pickRelatedObservations(
    observations,
    durationMs,
    selectedObservation?.id,
  );

  return fitPageContextSnapshot({
    version: 1,
    kind: "trace",
    label: "Trace",
    id: truncateText(trace.id, PAGE_CONTEXT_LIMITS.id),
    title: truncateText(
      trace.name ?? "Unnamed trace",
      PAGE_CONTEXT_LIMITS.title,
    ),
    facts: facts.slice(0, PAGE_CONTEXT_LIMITS.facts),
    surface: params.surface,
    path: truncateText(params.path, PAGE_CONTEXT_LIMITS.path),
    ...(selectedObservation
      ? { focus: observationEntity(selectedObservation, durationMs) }
      : {}),
    ...(related.length > 0 ? { related } : {}),
  });
}
