/**
 * MCP Tools
 *
 * Export all MCP tool definitions and handlers.
 *
 * Tools (5/25 - within MCP best practice limit):
 * - getPrompt (read): Fetch specific prompt by name/label/version
 * - listPrompts (read): List and filter prompts
 * - createTextPrompt (write): Create new text prompt version
 * - createChatPrompt (write): Create new chat prompt version
 * - updatePromptLabels (write): Update labels only
 */

export { getPromptTool, handleGetPrompt } from "./getPrompt";
export { listPromptsTool, handleListPrompts } from "./listPrompts";
export {
  createTextPromptTool,
  handleCreateTextPrompt,
} from "./createTextPrompt";
export {
  createChatPromptTool,
  handleCreateChatPrompt,
} from "./createChatPrompt";
export {
  updatePromptLabelsTool,
  handleUpdatePromptLabels,
} from "./updatePromptLabels";
