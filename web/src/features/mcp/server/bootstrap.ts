/**
 * MCP Feature Bootstrap
 *
 * Registers all MCP feature modules at application startup.
 * This file is imported once when the server starts to initialize the tool registry.
 *
 * To add a new MCP feature:
 * 1. Create feature module in /server/[feature-name]/
 * 2. Import feature module here
 * 3. Call toolRegistry.register(featureModule)
 */

import { toolRegistry, type McpFeatureModule } from "./registry";
import { promptsFeature } from "./prompts";
import { observationsFeature } from "./observations";
import { annotationQueuesFeature } from "./annotationQueues";
import { commentsFeature } from "./comments";
import { datasetsFeature } from "./datasets";
import { healthFeature } from "./health";
import { scoresFeature } from "./scores";
import { metricsFeature } from "./metrics";
import { modelsFeature } from "./models";
import { mediaFeature } from "./media";
import { evalsFeature } from "./evals";
import { dashboardWidgetsFeature } from "./dashboardWidgets";
import { feedbackFeature } from "./feedback";
import { experimentsFeature } from "./experiments";
import { monitorsFeature } from "./monitors";
import { v4MigrationFeature } from "./v4Migration";

const MCP_FEATURES = [
  promptsFeature,
  observationsFeature,
  annotationQueuesFeature,
  commentsFeature,
  datasetsFeature,
  healthFeature,
  scoresFeature,
  metricsFeature,
  modelsFeature,
  mediaFeature,
  evalsFeature,
  dashboardWidgetsFeature,
  feedbackFeature,
  experimentsFeature,
  monitorsFeature,
  v4MigrationFeature,
] as const satisfies readonly McpFeatureModule[];

type McpFeature = (typeof MCP_FEATURES)[number];
export type McpToolName = McpFeature["tools"][number]["definition"]["name"];

/**
 * Bootstrap all MCP features
 *
 * Called once at application startup to register all MCP feature modules.
 * Features are registered in order of dependency (if any exist).
 */
export function bootstrapMcpFeatures(): void {
  // Register all feature modules
  for (const feature of MCP_FEATURES) {
    toolRegistry.register(feature);
  }
}

/**
 * Auto-bootstrap when this module is imported
 *
 * This runs once when the server starts, ensuring tools are registered
 * before any MCP requests are handled.
 */
bootstrapMcpFeatures();
