import { agentGraphScenario } from "./agent-graph";
import { agentTimelineScenario } from "./agent-timeline";
import { annotationQueueScenario } from "./annotation-queue";
import { customModelsScenario } from "./custom-models";
import { deepChainScenario } from "./deep-chain";
import { longSessionScenario } from "./long-session";
import { manyTracesScenario } from "./many-traces";
import { outlierTrafficScenario } from "./outlier-traffic";
import { scoredTracesScenario } from "./scored-traces";
import { sessionShapesScenario } from "./session-shapes";
import { supportAgentScenario } from "./support-agent";
import { timelineShapesScenario } from "./timeline-shapes";
import { traceTreeScenario } from "./trace-tree";
import { ScenarioDefinition } from "./types";

/**
 * Scenario registry. Names are part of the CLI contract — additive only.
 */
export const scenarios: Record<string, ScenarioDefinition> = {
  "trace-tree": traceTreeScenario,
  "agent-timeline": agentTimelineScenario,
  "agent-graph": agentGraphScenario,
  "deep-chain": deepChainScenario,
  "long-session": longSessionScenario,
  "many-traces": manyTracesScenario,
  "outlier-traffic": outlierTrafficScenario,
  "scored-traces": scoredTracesScenario,
  "session-shapes": sessionShapesScenario,
  "annotation-queue": annotationQueueScenario,
  "custom-models": customModelsScenario,
  "support-agent": supportAgentScenario,
  "timeline-shapes": timelineShapesScenario,
};

export * from "./types";
