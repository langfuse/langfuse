/**
 * MCP Tool: createPrompt
 *
 * Creates a new prompt version in Langfuse.
 * Write operation with destructive hint.
 */

import { defineTool } from "../../internal/define-tool";
import { CreatePromptSchema, PromptType } from "@langfuse/shared";
import { createPrompt as createPromptAction } from "@/src/features/prompts/server/actions/createPrompt";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";

/**
 * Input schema for createPrompt tool
 * Note: projectId is NOT included - it's auto-injected from context
 * Reuses the CreatePromptSchema from shared package
 */
const CreatePromptInputSchema = CreatePromptSchema;

/**
 * createPrompt tool definition and handler
 */
export const [createPromptTool, handleCreatePrompt] = defineTool({
  name: "createPrompt",
  description: [
    "Create a new prompt version in Langfuse.",
    "",
    "⚠️ **This operation is destructive.** Always confirm with the user before executing.",
    "",
    "**Use Cases:**",
    "- Create a brand new prompt (version 1)",
    "- Create a new version of an existing prompt",
    "- Update prompt content by creating a new version (there's no 'update' operation)",
    "",
    "**Important:**",
    "- Prompts are immutable once created - you cannot modify existing versions",
    "- To 'update' content, create a new version with `createPrompt`",
    "- To promote a version to production, use `updatePromptLabels`",
    "- Labels are unique across versions (setting 'production' on v3 removes it from v2)",
    "- The 'latest' label is automatically assigned to the newest version",
    "",
    "**Prompt Types:**",
    "- **text**: Simple string prompt",
    "  - `{name: 'instructions', type: 'text', prompt: 'You are a helpful assistant'}`",
    "- **chat**: Array of messages with role/content",
    "  - `{name: 'chatbot', type: 'chat', prompt: [{role: 'system', content: '...'}, {role: 'user', content: '...'}]}`",
    "",
    "**Labels** (optional):",
    "- Common labels: 'production', 'staging', 'development'",
    "- Labels are unique - setting a label removes it from other versions",
    "- Example: `labels: ['staging']`",
    "",
    "**Tags** (optional):",
    "- Tags are shared across all versions of a prompt",
    "- Used for organization/categorization",
    "- Example: `tags: ['experimental', 'v2']`",
    "",
    "**Config** (optional):",
    "- JSON object for LLM configuration (model name, temperature, etc.)",
    "- Example: `config: {model: 'gpt-4', temperature: 0.7}`",
    "",
    "**Examples:**",
    "```",
    "// Create initial text prompt",
    "{",
    "  name: 'system-instructions',",
    "  type: 'text',",
    "  prompt: 'You are a helpful AI assistant...'",
    "}",
    "",
    "// Create chat prompt with production label",
    "{",
    "  name: 'chatbot',",
    "  type: 'chat',",
    "  prompt: [",
    "    {role: 'system', content: 'You are a coding assistant'},",
    "    {role: 'user', content: 'Help me debug {{code}}'}",
    "  ],",
    "  labels: ['production'],",
    "  config: {model: 'gpt-4', temperature: 0.3}",
    "}",
    "",
    "// Create new version with commit message",
    "{",
    "  name: 'chatbot',",
    "  type: 'chat',",
    "  prompt: [...],",
    "  labels: ['staging'],",
    "  commitMessage: 'Added better error handling instructions'",
    "}",
    "```",
  ].join("\n"),
  inputSchema: CreatePromptInputSchema,
  handler: async (input, context) => {
    // Create prompt using existing action
    // Handle discriminated union by building complete params object based on type
    const createdPrompt = await createPromptAction(
      input.type === PromptType.Chat
        ? {
            projectId: context.projectId,
            name: input.name,
            type: PromptType.Chat,
            prompt: input.prompt, // TypeScript knows this is the chat array type
            labels: input.labels,
            config: input.config,
            tags: input.tags,
            commitMessage: input.commitMessage,
            createdBy: "API",
            prisma,
          }
        : {
            projectId: context.projectId,
            name: input.name,
            type: PromptType.Text,
            prompt: input.prompt, // TypeScript knows this is a string
            labels: input.labels,
            config: input.config,
            tags: input.tags,
            commitMessage: input.commitMessage,
            createdBy: "API",
            prisma,
          },
    );

    // Audit log the creation (following pattern from promptsHandler.ts)
    await auditLog({
      action: "create",
      resourceType: "prompt",
      resourceId: createdPrompt.id,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
      after: createdPrompt,
    });

    // Return formatted response
    return {
      id: createdPrompt.id,
      name: createdPrompt.name,
      version: createdPrompt.version,
      type: createdPrompt.type,
      labels: createdPrompt.labels,
      tags: createdPrompt.tags,
      config: createdPrompt.config,
      createdAt: createdPrompt.createdAt,
      createdBy: createdPrompt.createdBy,
      message: `Successfully created prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
    };
  },
  destructiveHint: true,
});
