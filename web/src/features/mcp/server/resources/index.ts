/**
 * MCP Resources
 *
 * Export all MCP resource definitions and handlers.
 *
 * Implemented resources:
 * - langfuse://prompts - List prompts with filtering
 * - langfuse://prompt/{name} - Get a specific prompt
 */

export { listPromptsResource, getPromptResource } from "./prompts";
