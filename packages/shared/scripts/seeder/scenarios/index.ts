import { agentGraphScenario } from "./agent-graph";
import { agentTimelineScenario } from "./agent-timeline";
import { annotationQueueScenario } from "./annotation-queue";
import { assistantSkillsScenario } from "./assistant-skills";
import { customModelsScenario } from "./custom-models";
import { deepChainScenario } from "./deep-chain";
import { evaluatorGalleryScenario } from "./evaluator-gallery";
import { experimentFiltersScenario } from "./experiment-filters";
import { experimentIoScenario } from "./experiment-io";
import { gatewayTrafficScenario } from "./gateway-traffic";
import { incidentSessionScenario } from "./incident-session";
import { longSessionScenario } from "./long-session";
import { manyTracesScenario } from "./many-traces";
import { outlierTrafficScenario } from "./outlier-traffic";
import { scoredTracesScenario } from "./scored-traces";
import { sessionShapesScenario } from "./session-shapes";
import { sessionThreadsScenario } from "./session-threads";
import { sessionVarietyScenario } from "./session-variety";
import { supportAgentScenario } from "./support-agent";
import { timelineAnnotatedScenario } from "./timeline-annotated";
import { timelineShapesScenario } from "./timeline-shapes";
import { topicsScenario } from "./topics";
import { traceTreeScenario } from "./trace-tree";
import { ScenarioDefinition } from "./types";

/**
 * Scenario registry. Names are part of the CLI contract — additive only.
 */
export const scenarios: Record<string, ScenarioDefinition> = {
  "trace-tree": traceTreeScenario,
  "agent-timeline": agentTimelineScenario,
  "agent-graph": agentGraphScenario,
  "assistant-skills": assistantSkillsScenario,
  "deep-chain": deepChainScenario,
  "evaluator-gallery": evaluatorGalleryScenario,
  "experiment-io": experimentIoScenario,
  "experiment-filters": experimentFiltersScenario,
  "gateway-traffic": gatewayTrafficScenario,
  "long-session": longSessionScenario,
  "many-traces": manyTracesScenario,
  "outlier-traffic": outlierTrafficScenario,
  "scored-traces": scoredTracesScenario,
  "session-shapes": sessionShapesScenario,
  "session-threads": sessionThreadsScenario,
  "session-variety": sessionVarietyScenario,
  "annotation-queue": annotationQueueScenario,
  "custom-models": customModelsScenario,
  "support-agent": supportAgentScenario,
  "incident-session": incidentSessionScenario,
  "timeline-annotated": timelineAnnotatedScenario,
  "timeline-shapes": timelineShapesScenario,
  topics: topicsScenario,
};

export * from "./types";
