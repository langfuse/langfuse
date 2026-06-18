import { longSessionScenario } from "./long-session";
import { manyTracesScenario } from "./many-traces";
import { traceTreeScenario } from "./trace-tree";
import { ScenarioDefinition } from "./types";

/**
 * Scenario registry. Names are part of the CLI contract — additive only.
 */
export const scenarios: Record<string, ScenarioDefinition> = {
  "trace-tree": traceTreeScenario,
  "long-session": longSessionScenario,
  "many-traces": manyTracesScenario,
};

export * from "./types";
