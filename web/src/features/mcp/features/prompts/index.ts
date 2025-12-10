/**
 * Prompts MCP Feature Module
 *
 * Provides tools for managing Langfuse prompts via the MCP protocol.
 * This module exports all prompt-related tools for registration with the MCP server.
 *
 * Tools provided:
 * - getPrompt: Fetch specific prompts by name/label/version (read-only)
 * - getPromptUnresolved: Fetch prompts without resolving dependencies (read-only)
 * - listPrompts: List and filter prompts with pagination (read-only)
 * - createTextPrompt: Create new text prompt versions (destructive)
 * - createChatPrompt: Create new chat prompt versions (destructive)
 * - updatePromptLabels: Update labels on prompt versions (destructive)
 */

import type { McpFeatureModule } from "../../server/registry";
import { getPromptTool, handleGetPrompt } from "./tools/getPrompt";
import {
  getPromptUnresolvedTool,
  handleGetPromptUnresolved,
} from "./tools/getPromptUnresolved";
import { listPromptsTool, handleListPrompts } from "./tools/listPrompts";
import {
  createTextPromptTool,
  handleCreateTextPrompt,
} from "./tools/createTextPrompt";
import {
  createChatPromptTool,
  handleCreateChatPrompt,
} from "./tools/createChatPrompt";
import {
  updatePromptLabelsTool,
  handleUpdatePromptLabels,
} from "./tools/updatePromptLabels";

/**
 * Prompts Feature Module
 *
 * Registers all prompt management tools with the MCP server.
 * Tools are automatically available to MCP clients once registered.
 */
export const promptsFeature: McpFeatureModule = {
  name: "prompts",
  description:
    "Manage Langfuse prompts - create, retrieve, and update prompt versions",

  tools: [
    {
      definition: getPromptTool,
      handler: handleGetPrompt,
    },
    {
      definition: getPromptUnresolvedTool,
      handler: handleGetPromptUnresolved,
    },
    {
      definition: listPromptsTool,
      handler: handleListPrompts,
    },
    {
      definition: createTextPromptTool,
      handler: handleCreateTextPrompt,
    },
    {
      definition: createChatPromptTool,
      handler: handleCreateChatPrompt,
    },
    {
      definition: updatePromptLabelsTool,
      handler: handleUpdatePromptLabels,
    },
  ],

  // Optional: Feature can be conditionally enabled based on context
  // isEnabled: async (context) => {
  //   // Example: Check entitlements, feature flags, etc.
  //   return true;
  // },
};
