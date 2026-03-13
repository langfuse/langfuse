/**
 * MCP Tool: getPrompt
 *
 * Fetches a specific prompt by name with optional label or version.
 * Read-only operation.
 */

import { createPromptReadTool } from "./promptReadToolFactory";

export const [getPromptTool, handleGetPrompt] = createPromptReadTool({
  name: "getPrompt",
  description: [
    "Fetch a specific prompt by name with optional label or version parameter.",
    "",
    "Retrieval options:",
    "- label: Get prompt with specific label (e.g., 'production', 'staging')",
    "- version: Get specific version number (e.g., 1, 2, 3)",
    "- neither: Returns 'production' version by default",
    "",
    "Note: label and version are mutually exclusive. Returns full prompt content with resolved dependencies.",
  ].join("\n"),
  resolve: true,
  spanName: "mcp.prompts.get",
});
