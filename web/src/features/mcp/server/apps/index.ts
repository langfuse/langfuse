import { env } from "@/src/env.mjs";
import type { McpFeatureModule } from "../tools";
import { handleRenderWidget, renderWidgetTool } from "./tools/renderWidget";

/**
 * MCP Apps: tools whose results render as interactive UI in hosts that
 * support the extension, with a text answer everywhere else.
 */
export const appsFeature = {
  name: "apps",
  description: "Render Langfuse charts inline in the chat (MCP Apps)",
  tools: [{ definition: renderWidgetTool, handler: handleRenderWidget }],
  // renderWidget queries the v2 views, so it is offered where queryMetrics
  // is. The in-app agent renders no apps, but its 2025-era client declares
  // no capabilities per request (see clientMayRenderApps).
  isEnabled: async (context) =>
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" &&
    !context.inAppAgent,
} as const satisfies McpFeatureModule;
