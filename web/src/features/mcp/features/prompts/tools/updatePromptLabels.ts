/**
 * MCP Tool: updatePromptLabels
 *
 * Updates labels for a specific prompt version.
 * Write operation with destructive hint.
 * This is the ONLY way to modify existing prompts (labels only).
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import { ParamPromptName, ParamNewLabels } from "../validation";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";
import { UserInputError } from "../../../core/errors";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

import { PROMPT_NAME_MAX_LENGTH } from "@langfuse/shared";

/**
 * Base schema for JSON Schema generation (MCP client display)
 * Uses simple types without refinements
 */
const UpdatePromptLabelsBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(PROMPT_NAME_MAX_LENGTH)
    .describe("The name of the prompt"),
  version: z.coerce
    .number()
    .int()
    .positive()
    .describe("The version number to update (required)"),
  newLabels: z
    .array(z.string())
    .describe(
      "Array of new labels to assign to the prompt version (can be empty to remove all labels)",
    ),
});

/**
 * Input schema for runtime validation
 * Uses full validation schemas with refinements
 */
const UpdatePromptLabelsInputSchema = z.object({
  name: ParamPromptName,
  version: z.coerce
    .number()
    .int()
    .positive()
    .describe("The version number to update (required)"),
  newLabels: ParamNewLabels,
});

/**
 * updatePromptLabels tool definition and handler
 */
export const [updatePromptLabelsTool, handleUpdatePromptLabels] = defineTool({
  name: "updatePromptLabels",
  description: [
    "Update labels for a specific prompt version.",
    "",
    "Important:",
    "- ONLY way to modify existing prompts (labels only)",
    "- Specified labels are added to the version (preserving others not mentioned)",
    "- Labels are unique across versions - setting a label on one version automatically removes it from others",
    "- 'latest' label is auto-managed and cannot be set manually",
    "- Cannot modify prompt content, type, or tags - use createTextPrompt or createChatPrompt for new versions",
    "",
    "Accepts: name, version (required), newLabels (array, can be empty to remove all labels)",
  ].join("\n"),
  baseSchema: UpdatePromptLabelsBaseSchema,
  inputSchema: UpdatePromptLabelsInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.update_labels", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { name, version, newLabels } = input;

        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": name,
          "mcp.prompt_version": version,
          "mcp.new_labels_count": newLabels.length,
        });

        // Fetch existing prompt to capture "before" state for audit log
        const existingPrompt = await prisma.prompt.findUnique({
          where: {
            projectId_name_version: {
              projectId: context.projectId,
              name,
              version,
            },
          },
        });

        if (!existingPrompt) {
          throw new UserInputError(
            `Prompt '${name}' version ${version} not found in project`,
          );
        }

        // Update prompt labels using existing action
        const updatedPrompt = await updatePrompt({
          promptName: name,
          projectId: context.projectId, // Auto-injected from authenticated API key
          promptVersion: version,
          newLabels,
        });

        // Audit log the update with both before and after states
        await auditLog({
          action: "update",
          resourceType: "prompt",
          resourceId: updatedPrompt.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: existingPrompt,
          after: updatedPrompt,
        });

        // Return formatted response
        return {
          id: updatedPrompt.id,
          name: updatedPrompt.name,
          version: updatedPrompt.version,
          labels: updatedPrompt.labels,
          message: `Successfully updated labels for '${updatedPrompt.name}' version ${updatedPrompt.version}. Labels are now: ${updatedPrompt.labels.length > 0 ? updatedPrompt.labels.join(", ") : "(none)"}`,
        };
      },
    );
  },
});
