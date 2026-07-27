/**
 * MCP Tool: createTextPrompt
 *
 * Creates a new text prompt version in Langfuse.
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
 * Base schema for JSON Schema generation (MCP client display)
 * Uses simple types that serialize well to JSON Schema
 */
const CreateTextPromptBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(PROMPT_NAME_MAX_LENGTH)
    .describe("The name of the prompt"),
  prompt: z
    .string()
    .describe("The prompt text content (supports {{variables}})"),
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
const CreateTextPromptInputSchema = z.object({
  name: PromptNameSchema,
  prompt: z.string(),
  labels: ParamCreatePromptLabels,
  config: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).optional(),
});

/**
 * createTextPrompt tool definition and handler
 */
export const [createTextPromptTool, handleCreateTextPrompt] = defineTool({
  name: "createTextPrompt",
  description: [
    "Create a new text prompt version in Langfuse.",
    "",
    "Important:",
    "- Prompts are immutable - cannot modify existing versions",
    "- To update content, create a new version",
    "- New prompt versions receive the 'latest' label automatically",
    "- Cannot assign the 'production' label during creation",
    "- To promote to production, use updatePromptLabels only when the user explicitly requests it",
    "- Labels are unique across versions",
    "- Use {{variable_name}} syntax for dynamic content",
    "",
    "Accepts: name, prompt (string), optional labels, config, tags, commitMessage",
  ].join("\n"),
  baseSchema: CreateTextPromptBaseSchema,
  inputSchema: CreateTextPromptInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.prompts.create_text",
      context,
      attributes: {
        "mcp.prompt_name": input.name,
        "mcp.prompt_type": "text",
      },
      fn: async (span) => {
        const createdPrompt = await createPromptForApi({
          context,
          input: CreatePromptSchema.parse({
            name: input.name,
            type: PromptType.Text,
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
          message: `Successfully created text prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
        };
      },
    });
  },
  destructiveHint: true,
});
