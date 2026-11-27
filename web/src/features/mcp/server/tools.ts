/**
 * MCP Tools
 *
 * The feature modules whose tools the MCP server offers. To add a feature,
 * create a module in /server/[feature-name]/ and list it in MCP_FEATURES.
 */

import type { ToolDefinition, ToolHandler } from "../core/define-tool";
import type { ServerContext } from "../types";
import { promptsFeature } from "./prompts";
import { skillsFeature } from "./skills";
import { observationsFeature } from "./observations";
import { annotationQueuesFeature } from "./annotationQueues";
import { commentsFeature } from "./comments";
import { datasetsFeature } from "./datasets";
import { healthFeature } from "./health";
import { scoresFeature } from "./scores";
import { metricsFeature } from "./metrics";
import { modelsFeature } from "./models";
import { llmConnectionsFeature } from "./llmConnections";
import { mediaFeature } from "./media";
import { batchEvaluationsFeature, evalsFeature } from "./evals";
import { dashboardWidgetsFeature } from "./dashboardWidgets";
import { feedbackFeature } from "./feedback";
import { experimentsFeature } from "./experiments";
import { externalMediaStorageFeature } from "@/src/ee/features/external-media-storage/server/mcp";
import { monitorsFeature } from "./monitors";
import { topicsFeature } from "./topics";
import { v4MigrationFeature } from "./v4Migration";
import { appsFeature } from "./apps";

/** A tool's definition (for the MCP protocol) and its handler. */
export interface RegisteredTool<TName extends string = string> {
  definition: ToolDefinition<TName>;
  handler: ToolHandler<any>;
}

/**
 * A feature domain (prompts, datasets, ...) and its tools.
 *
 * @example
 * ```typescript
 * export const promptsFeature = {
 *   name: "prompts",
 *   description: "Manage Langfuse prompts",
 *   tools: [
 *     { definition: getPromptTool, handler: handleGetPrompt },
 *     { definition: listPromptsTool, handler: handleListPrompts },
 *   ],
 * } as const satisfies McpFeatureModule;
 * ```
 */
export interface McpFeatureModule {
  /** Feature identifier (e.g., 'prompts', 'datasets') */
  name: string;

  /** Feature description */
  description: string;

  /** Tools provided by this feature */
  tools: readonly RegisteredTool[];

  /** Whether the feature is offered in the given context (entitlements, flags). */
  isEnabled?: (context: ServerContext) => boolean | Promise<boolean>;
}

const MCP_FEATURES = [
  promptsFeature,
  skillsFeature,
  observationsFeature,
  annotationQueuesFeature,
  commentsFeature,
  datasetsFeature,
  healthFeature,
  scoresFeature,
  metricsFeature,
  modelsFeature,
  llmConnectionsFeature,
  mediaFeature,
  evalsFeature,
  batchEvaluationsFeature,
  dashboardWidgetsFeature,
  feedbackFeature,
  experimentsFeature,
  externalMediaStorageFeature,
  monitorsFeature,
  topicsFeature,
  v4MigrationFeature,
  appsFeature,
] as const satisfies readonly McpFeatureModule[];

export type McpToolName =
  (typeof MCP_FEATURES)[number]["tools"][number]["definition"]["name"];

/**
 * Every tool of every feature, enabled or not.
 * @knipignore Lets policy tests check the complete registry, including disabled tools.
 */
export const MCP_TOOLS: readonly RegisteredTool[] = MCP_FEATURES.flatMap(
  (feature: McpFeatureModule) => feature.tools,
);

const duplicate = MCP_TOOLS.find(
  (tool, index) =>
    MCP_TOOLS.findIndex(
      (other) => other.definition.name === tool.definition.name,
    ) !== index,
);
if (duplicate) {
  throw new Error(
    `MCP tool '${duplicate.definition.name}' is defined more than once`,
  );
}

/** The tools a request in this context lists. */
export async function getEnabledTools(
  context: ServerContext,
): Promise<RegisteredTool[]> {
  const enabled = await Promise.all(
    MCP_FEATURES.map(async (feature: McpFeatureModule) =>
      !feature.isEnabled || (await feature.isEnabled(context))
        ? feature.tools
        : [],
    ),
  );
  return enabled.flat();
}

/**
 * The tool with this name, when its feature is enabled in this context. Only
 * the owning feature's check runs, so a call costs no other feature's lookup.
 */
export async function getEnabledTool(
  name: string,
  context: ServerContext,
): Promise<RegisteredTool | undefined> {
  for (const feature of MCP_FEATURES as readonly McpFeatureModule[]) {
    const tool = feature.tools.find((t) => t.definition.name === name);
    if (tool) {
      return !feature.isEnabled || (await feature.isEnabled(context))
        ? tool
        : undefined;
    }
  }
  return undefined;
}

/**
 * Whether the context may call a listed tool. In-app agent keys list every
 * enabled tool but call only read-only ones, plus the mutating tools a prior
 * approval allowed for this run.
 */
export function canCallTool(
  tool: RegisteredTool,
  context: ServerContext,
): boolean {
  const { inAppAgent } = context;
  return (
    !inAppAgent ||
    tool.definition.annotations?.readOnlyHint === true ||
    (inAppAgent.permissions === "tool-allowlist" &&
      inAppAgent.allowedToolNames.some((name) => name === tool.definition.name))
  );
}
