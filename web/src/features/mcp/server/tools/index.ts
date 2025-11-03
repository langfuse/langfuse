/**
 * MCP Tools
 *
 * Export all MCP tool definitions and handlers.
 *
 * Tools (4/25 - within MCP best practice limit):
 * - getPrompt (read): Fetch specific prompt by name/label/version
 * - listPrompts (read): List and filter prompts
 * - createPrompt (write): Create new prompt version
 * - updatePromptLabels (write): Update labels only
 */

export { getPromptTool, handleGetPrompt } from "./getPrompt";
export { listPromptsTool, handleListPrompts } from "./listPrompts";
export { createPromptTool, handleCreatePrompt } from "./createPrompt";
export {
  updatePromptLabelsTool,
  handleUpdatePromptLabels,
} from "./updatePromptLabels";
