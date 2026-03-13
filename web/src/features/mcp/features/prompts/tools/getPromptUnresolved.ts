/**
 * MCP Tool: getPromptUnresolved
 *
 * Fetches a specific prompt by name with optional label or version WITHOUT resolving dependencies.
 * Returns the raw prompt content with dependency tags intact for prompt composition/stacking analysis.
 * Read-only operation.
 */

import { createPromptReadTool } from "./promptReadToolFactory";

export const [getPromptUnresolvedTool, handleGetPromptUnresolved] =
  createPromptReadTool({
    name: "getPromptUnresolved",
    description: [
      "Fetch a specific prompt by name with optional label or version parameter WITHOUT resolving dependencies.",
      "",
      "Returns the raw prompt content with dependency tags intact. Useful for:",
      "- Understanding prompt composition/stacking before resolution",
      "- Debugging prompt dependencies",
      "- Analyzing the dependency graph structure",
      "",
      "Retrieval options:",
      "- label: Get prompt with specific label (e.g., 'production', 'staging')",
      "- version: Get specific version number (e.g., 1, 2, 3)",
      "- neither: Returns 'production' version by default",
      "",
      "Note: label and version are mutually exclusive. To get resolved prompts, use the 'getPrompt' tool instead.",
    ].join("\n"),
    resolve: false,
    spanName: "mcp.prompts.getUnresolved",
  });
