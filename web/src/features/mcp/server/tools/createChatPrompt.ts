/**
 * MCP Tool: createChatPrompt
 *
 * Creates a new chat prompt version in Langfuse.
 * Write operation with destructive hint.
 */

import { z } from "zod/v4";
import { defineTool } from "../../internal/define-tool";
import {
  PromptType,
  PromptLabelSchema,
  PromptNameSchema,
  COMMIT_MESSAGE_MAX_LENGTH,
} from "@langfuse/shared";
import { jsonSchema } from "@langfuse/shared";
import { createPrompt as createPromptAction } from "@/src/features/prompts/server/actions/createPrompt";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

/**
 * Schema for a single chat message (role + content)
 * Note: Using simple object schema instead of union to comply with MCP spec
 */
const ChatMessageSchema = z.object({
  role: z.string().describe("The role (e.g., 'system', 'user', 'assistant')"),
  content: z.string().describe("The message content"),
});

/**
 * Schema for creating a chat prompt (array of messages)
 */
const CreateChatPromptBaseSchema = z.object({
  name: PromptNameSchema.describe("The name of the prompt"),
  prompt: z
    .array(ChatMessageSchema)
    .min(1, "Chat prompts must have at least one message")
    .describe("Array of chat messages with role and content"),
  labels: z
    .array(PromptLabelSchema)
    .optional()
    .describe("Labels to assign (e.g., ['production', 'staging'])"),
  config: jsonSchema
    .nullish()
    .describe(
      "Optional JSON config (e.g., {model: 'gpt-4', temperature: 0.7})",
    ),
  tags: z
    .array(z.string())
    .nullish()
    .describe("Optional tags for organization (e.g., ['experimental', 'v2'])"),
  commitMessage: z
    .string()
    .max(COMMIT_MESSAGE_MAX_LENGTH)
    .nullish()
    .describe("Optional commit message describing the changes"),
});

/**
 * createChatPrompt tool definition and handler
 */
export const [createChatPromptTool, handleCreateChatPrompt] = defineTool({
  name: "createChatPrompt",
  description: [
    "Create a new chat prompt version in Langfuse.",
    "",
    "⚠️ **This operation is destructive.** Always confirm with the user before executing.",
    "",
    "**Use Cases:**",
    "- Create multi-turn conversation prompts",
    "- Create prompts with system, user, and assistant messages",
    "",
    "**Important:**",
    "- Prompts are immutable once created - you cannot modify existing versions",
    "- To 'update' content, create a new version",
    "- To promote a version to production, use `updatePromptLabels`",
    "- Labels are unique across versions",
    "",
    "**Message Roles:**",
    "- `system`: System instructions",
    "- `user`: User input (can contain {{variables}})",
    "- `assistant`: Assistant response examples",
    "",
    "**Examples:**",
    "```",
    "// Create simple chat prompt",
    "{",
    "  name: 'chatbot',",
    "  prompt: [",
    "    {role: 'system', content: 'You are a helpful assistant.'},",
    "    {role: 'user', content: 'Help me with {{task}}'}",
    "  ]",
    "}",
    "",
    "// Create with labels and config",
    "{",
    "  name: 'code-assistant',",
    "  prompt: [",
    "    {role: 'system', content: 'You are a {{language}} expert.'},",
    "    {role: 'user', content: 'Review this code: {{code}}'},",
    "    {role: 'assistant', content: 'I will analyze the code for bugs and improvements.'}",
    "  ],",
    "  labels: ['production'],",
    "  config: {model: 'gpt-4', temperature: 0.3},",
    "  commitMessage: 'Added assistant example'",
    "}",
    "```",
  ].join("\n"),
  baseSchema: CreateChatPromptBaseSchema,
  inputSchema: CreateChatPromptBaseSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.create_chat", spanKind: SpanKind.INTERNAL },
      async (span) => {
        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": input.name,
          "mcp.prompt_type": "chat",
          "mcp.message_count": input.prompt.length,
          "mcp.labels_count": input.labels?.length ?? 0,
          "mcp.has_config": input.config ? "true" : "false",
          "mcp.has_tags": input.tags ? "true" : "false",
        });

        const createdPrompt = await createPromptAction({
          projectId: context.projectId,
          name: input.name,
          type: PromptType.Chat,
          prompt: input.prompt,
          labels: input.labels ?? [],
          config: input.config ?? {},
          tags: input.tags,
          commitMessage: input.commitMessage,
          createdBy: "API",
          prisma,
        });

        // Set created version for observability
        span.setAttribute("mcp.created_version", createdPrompt.version);

        await auditLog({
          action: "create",
          resourceType: "prompt",
          resourceId: createdPrompt.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: createdPrompt,
        });

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
          message: `Successfully created chat prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
        };
      },
    );
  },
  destructive: true,
});
