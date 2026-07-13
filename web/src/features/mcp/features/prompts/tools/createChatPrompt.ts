/**
 * MCP Tool: createChatPrompt
 *
 * Creates a new chat prompt version in Langfuse.
 */

import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import {
  CreatePromptSchema,
  PromptType,
  PromptNameSchema,
  COMMIT_MESSAGE_MAX_LENGTH,
  PROMPT_NAME_MAX_LENGTH,
} from "@langfuse/shared";
import { createPromptForApi } from "@/src/features/prompts/server/prompt-api-service";
import { buildPromptUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { ParamCreatePromptLabels } from "../validation";

/**
 * Schema for a single chat message (role + content)
 * Note: Using simple object schema instead of union to comply with MCP spec
 */
const ChatMessageSchema = z.object({
  role: z.string().describe("The role (e.g., 'system', 'user', 'assistant')"),
  content: z.string().describe("The message content"),
});

/**
 * Base schema for JSON Schema generation (MCP client display)
 * Uses simple types that serialize well to JSON Schema
 */
const CreateChatPromptBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(PROMPT_NAME_MAX_LENGTH)
    .describe("The name of the prompt"),
  prompt: z
    .array(ChatMessageSchema)
    .min(1)
    .describe("Array of chat messages with role and content"),
  labels: z
    .array(z.string())
    .optional()
    .describe(
      "Optional labels to assign, excluding 'production'. New prompt versions receive the 'latest' label automatically.",
    ),
  config: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      "Optional JSON config (e.g., {model: 'gpt-4', temperature: 0.7})",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags for organization (e.g., ['experimental', 'v2'])"),
  commitMessage: z
    .string()
    .optional()
    .describe("Optional commit message describing the changes"),
});

/**
 * Input schema for runtime validation
 * Uses full validation schemas from shared package
 */
const CreateChatPromptInputSchema = z.object({
  name: PromptNameSchema,
  prompt: z
    .array(ChatMessageSchema)
    .min(1, "Chat prompts must have at least one message"),
  labels: ParamCreatePromptLabels,
  config: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).optional(),
});

/**
 * createChatPrompt tool definition and handler
 */
export const [createChatPromptTool, handleCreateChatPrompt] = defineTool({
  name: "createChatPrompt",
  description: [
    "Create a new chat prompt version in Langfuse. Chat prompts are arrays of messages with roles and content.",
    "",
    "Important:",
    "- Prompts are immutable - cannot modify existing versions",
    "- To update content, create a new version",
    "- New prompt versions receive the 'latest' label automatically",
    "- Cannot assign the 'production' label during creation",
    "- To promote to production, use updatePromptLabels only when the user explicitly requests it",
    "- Labels are unique across versions",
    "",
    "Message roles: system (instructions), user (input, can contain {{variables}}), assistant (examples)",
    "Accepts: name, prompt (array of {role, content}), optional labels, config, tags, commitMessage",
  ].join("\n"),
  baseSchema: CreateChatPromptBaseSchema,
  inputSchema: CreateChatPromptInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.prompts.create_chat",
      context,
      attributes: {
        "mcp.prompt_name": input.name,
        "mcp.prompt_type": "chat",
      },
      fn: async (span) => {
        const createdPrompt = await createPromptForApi({
          context,
          input: CreatePromptSchema.parse({
            name: input.name,
            type: PromptType.Chat,
            prompt: input.prompt,
            labels: input.labels ?? [],
            config: input.config ?? {},
            tags: input.tags,
            commitMessage: input.commitMessage,
          }),
        });

        // Set created version for observability
        span.setAttribute("mcp.created_version", createdPrompt.version);

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
          url: buildPromptUrl({
            projectId: context.projectId,
            name: createdPrompt.name,
            version: createdPrompt.version,
          }),
          message: `Successfully created chat prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
        };
      },
    });
  },
  destructiveHint: true,
});
