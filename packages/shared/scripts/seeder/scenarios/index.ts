import { agentGraphScenario } from "./agent-graph";
import { agentTimelineScenario } from "./agent-timeline";
import { annotationQueueScenario } from "./annotation-queue";
import { customModelsScenario } from "./custom-models";
import { deepChainScenario } from "./deep-chain";
import { evaluatorGalleryScenario } from "./evaluator-gallery";
import { experimentIoScenario } from "./experiment-io";
import { failingIntegrationsScenario } from "./failing-integrations";
import { incidentSessionScenario } from "./incident-session";
import { longMetadataValuesScenario } from "./long-metadata-values";
import { longSessionScenario } from "./long-session";
import { manyTracesScenario } from "./many-traces";
import { nestedPromptsScenario } from "./nested-prompts";
import { outlierTrafficScenario } from "./outlier-traffic";
import { scoredTracesScenario } from "./scored-traces";
import { sessionShapesScenario } from "./session-shapes";
import { sessionVarietyScenario } from "./session-variety";
import { supportAgentScenario } from "./support-agent";
import { timelineAnnotatedScenario } from "./timeline-annotated";
import { timelineShapesScenario } from "./timeline-shapes";
import { traceTreeScenario } from "./trace-tree";
import { unpricedGenerationsScenario } from "./unpriced-generations";
import { ScenarioDefinition } from "./types";

/**
 * Scenario registry. Names are part of the CLI contract — additive only.
 */
export const scenarios: Record<string, ScenarioDefinition> = {
  "trace-tree": traceTreeScenario,
  "agent-timeline": agentTimelineScenario,
  "agent-graph": agentGraphScenario,
  "deep-chain": deepChainScenario,
  "evaluator-gallery": evaluatorGalleryScenario,
  "experiment-io": experimentIoScenario,
  "failing-integrations": failingIntegrationsScenario,
  "long-metadata-values": longMetadataValuesScenario,
  "long-session": longSessionScenario,
  "many-traces": manyTracesScenario,
  "nested-prompts": nestedPromptsScenario,
  "outlier-traffic": outlierTrafficScenario,
  "scored-traces": scoredTracesScenario,
  "session-shapes": sessionShapesScenario,
  "session-variety": sessionVarietyScenario,
  "annotation-queue": annotationQueueScenario,
  "custom-models": customModelsScenario,
  "support-agent": supportAgentScenario,
  "incident-session": incidentSessionScenario,
  "timeline-annotated": timelineAnnotatedScenario,
  "timeline-shapes": timelineShapesScenario,
  "unpriced-generations": unpricedGenerationsScenario,
};

export * from "./types";
