/**
 * MCP Feature Bootstrap
 *
 * Registers all MCP feature modules at application startup.
 * This file is imported once when the server starts to initialize the tool registry.
 *
 * To add a new MCP feature:
 * 1. Create feature module in /features/[feature-name]/
 * 2. Import feature module here
 * 3. Call toolRegistry.register(featureModule)
 */

import { toolRegistry } from "./registry";
import type { McpFeatureModule } from "./registry";
import { promptsFeature } from "../features/prompts";
import { observationsFeature } from "../features/observations";
import { annotationQueuesFeature } from "../features/annotationQueues";
import { commentsFeature } from "../features/comments";
import { datasetsFeature } from "../features/datasets";
import { healthFeature } from "../features/health";
import { scoresFeature } from "../features/scores";
import { metricsFeature } from "../features/metrics";
import { modelsFeature } from "../features/models";
import { mediaFeature } from "../features/media";
import { evalsFeature } from "../features/evals";
import { dashboardWidgetsFeature } from "../features/dashboardWidgets";

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
] as const satisfies readonly McpFeatureModule[];

export type McpFeature = (typeof MCP_FEATURES)[number];
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
