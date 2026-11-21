import type { McpFeatureModule } from "../registry";
import { handleRenderWidget, renderWidgetTool } from "./tools/renderWidget";

/**
 * MCP Apps: tools whose results render as interactive UI in hosts that
 * support the extension, with a text answer everywhere else.
 */
export const appsFeature = {
  name: "apps",
  description: "Render Langfuse charts inline in the chat (MCP Apps)",
  tools: [{ definition: renderWidgetTool, handler: handleRenderWidget }],
} as const satisfies McpFeatureModule;
