import { annotationQueueScenario } from "./annotation-queue";
import { longSessionScenario } from "./long-session";
import { manyTracesScenario } from "./many-traces";
import { scoredTracesScenario } from "./scored-traces";
import { traceTreeScenario } from "./trace-tree";
import { ScenarioDefinition } from "./types";

/**
 * Scenario registry. Names are part of the CLI contract — additive only.
 */
export const scenarios: Record<string, ScenarioDefinition> = {
  "trace-tree": traceTreeScenario,
  "long-session": longSessionScenario,
  "many-traces": manyTracesScenario,
  "scored-traces": scoredTracesScenario,
  "annotation-queue": annotationQueueScenario,
};

export * from "./types";
