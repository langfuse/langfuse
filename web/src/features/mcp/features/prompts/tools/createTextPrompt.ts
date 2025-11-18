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
} from "@langfuse/shared";
import { jsonSchema } from "@langfuse/shared";
import { createPrompt as createPromptAction } from "@/src/features/prompts/server/actions/createPrompt";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

/**
 * Schema for creating a text prompt (simple string content)
 */
const CreateTextPromptBaseSchema = z.object({
  name: PromptNameSchema.describe("The name of the prompt"),
  prompt: z
    .string()
    .describe("The prompt text content (supports {{variables}})"),
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
 * createTextPrompt tool definition and handler
 */
export const [createTextPromptTool, handleCreateTextPrompt] = defineTool({
  name: "createTextPrompt",
  description: [
    "Create a new text prompt version in Langfuse.",
    "",
    "⚠️ **This operation is destructive.** Always confirm with the user before executing.",
    "",
    "**Use Cases:**",
    "- Create simple text-based prompts (system instructions, templates)",
    "- Create a new version of an existing text prompt",
    "",
    "**Important:**",
    "- Prompts are immutable once created - you cannot modify existing versions",
    "- To 'update' content, create a new version",
    "- To promote a version to production, use `updatePromptLabels`",
    "- Labels are unique across versions",
    "",
    "**Prompt Variables:**",
    "Use `{{variable_name}}` syntax for dynamic content:",
    "- `'Hello {{name}}, welcome to {{service}}'`",
    "",
    "**Examples:**",
    "```",
    "// Create simple system prompt",
    "{",
    "  name: 'system-instructions',",
    "  prompt: 'You are a helpful AI assistant specialized in {{domain}}.'",
    "}",
    "",
    "// Create with labels and config",
    "{",
    "  name: 'code-reviewer',",
    "  prompt: 'Review the following {{language}} code for bugs and improvements.',",
    "  labels: ['production'],",
    "  config: {model: 'gpt-4', temperature: 0.3},",
    "  commitMessage: 'Initial production version'",
    "}",
    "```",
  ].join("\n"),
  baseSchema: CreateTextPromptBaseSchema,
  inputSchema: CreateTextPromptBaseSchema,
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
          "mcp.labels_count": input.labels?.length ?? 0,
          "mcp.has_config": input.config ? "true" : "false",
          "mcp.has_tags": input.tags ? "true" : "false",
          "mcp.has_commit_message": input.commitMessage ? "true" : "false",
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
  destructive: true,
});
