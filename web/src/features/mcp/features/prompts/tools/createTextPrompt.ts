/**
 * MCP Tool: createTextPrompt
 *
 * Creates a new text prompt version in Langfuse.
 * Write operation with destructive hint.
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import {
  PromptType,
  PromptLabelSchema,
  PromptNameSchema,
  COMMIT_MESSAGE_MAX_LENGTH,
  PROMPT_NAME_MAX_LENGTH,
} from "@langfuse/shared";
import { createPrompt as createPromptAction } from "@/src/features/prompts/server/actions/createPrompt";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

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
    .describe("Labels to assign (e.g., ['production', 'staging'])"),
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
  labels: z.array(PromptLabelSchema).optional(),
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
    "- To promote to production, use updatePromptLabels",
    "- Labels are unique across versions",
    "- Use {{variable_name}} syntax for dynamic content",
    "",
    "Accepts: name, prompt (string), optional labels, config, tags, commitMessage",
  ].join("\n"),
  baseSchema: CreateTextPromptBaseSchema,
  inputSchema: CreateTextPromptInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.create_text", spanKind: SpanKind.INTERNAL },
      async (span) => {
        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": input.name,
          "mcp.prompt_type": "text",
        });

        const createdPrompt = await createPromptAction({
          projectId: context.projectId,
          name: input.name,
          type: PromptType.Text,
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
          message: `Successfully created text prompt '${createdPrompt.name}' version ${createdPrompt.version}${createdPrompt.labels.length > 0 ? ` with labels: ${createdPrompt.labels.join(", ")}` : ""}`,
        };
      },
    );
  },
});
