/**
 * MCP Tool: updatePromptLabels
 *
 * Updates labels for a specific prompt version.
 * Write operation with destructive hint.
 * This is the ONLY way to modify existing prompts (labels only).
 */

import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { ParamPromptName, ParamNewLabels } from "../validation";
import { updatePromptLabelsForApi } from "@/src/features/prompts/server/prompt-api-service";
import { buildPromptUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

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
      "Array of new labels to assign to the prompt version (can be empty to remove all labels). The 'latest' label is auto-managed and cannot be supplied.",
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
    "- Only add the 'production' label when the user explicitly asks to promote this prompt version to production",
    "- Cannot modify prompt content, type, or tags - use createTextPrompt or createChatPrompt for new versions",
    "",
    "Accepts: name, version (required), newLabels (array, can be empty to remove all labels)",
  ].join("\n"),
  baseSchema: UpdatePromptLabelsBaseSchema,
  inputSchema: UpdatePromptLabelsInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.prompts.update_labels",
      context,
      attributes: {
        "mcp.prompt_name": input.name,
        "mcp.prompt_version": input.version,
        "mcp.new_labels_count": input.newLabels.length,
      },
      fn: async () => {
        const { name, version, newLabels } = input;

        const { updatedPrompt } = await updatePromptLabelsForApi({
          context,
          promptName: name,
          promptVersion: version,
          newLabels,
        });

        // Return formatted response
        return {
          id: updatedPrompt.id,
          name: updatedPrompt.name,
          version: updatedPrompt.version,
          labels: updatedPrompt.labels,
          url: buildPromptUrl({
            projectId: context.projectId,
            name: updatedPrompt.name,
            version: updatedPrompt.version,
          }),
          message: `Successfully updated labels for '${updatedPrompt.name}' version ${updatedPrompt.version}. Labels are now: ${updatedPrompt.labels.length > 0 ? updatedPrompt.labels.join(", ") : "(none)"}`,
        };
      },
    });
  },
  destructiveHint: true,
});
