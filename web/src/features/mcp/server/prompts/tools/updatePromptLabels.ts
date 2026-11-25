/**
 * MCP Tool: updatePromptLabels
 *
 * Updates labels for a specific prompt version.
 * Write operation with destructive hint.
 */

import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import {
  ParamPromptName,
  ParamNewLabels,
  ParamRemoveLabels,
} from "../validation";
import { updatePromptLabelsForApi } from "@/src/features/prompts/server/prompt-api-service";
import { buildPromptUrl } from "@langfuse/shared/src/server";
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
    .optional()
    .describe(
      "Labels to add to the prompt version. Existing labels are kept. The 'latest' label is auto-managed and cannot be supplied.",
    ),
  removeLabels: z
    .array(z.string())
    .optional()
    .describe(
      "Labels to remove from this prompt version. Labels not on this version are ignored. The 'latest' label cannot be removed.",
    ),
});

/**
 * Input schema for runtime validation
 * Uses full validation schemas with refinements
 */
const UpdatePromptLabelsInputSchema = z
  .object({
    name: ParamPromptName,
    version: z.coerce
      .number()
      .int()
      .positive()
      .describe("The version number to update (required)"),
    newLabels: ParamNewLabels.optional(),
    removeLabels: ParamRemoveLabels.optional(),
  })
  .refine(
    ({ newLabels = [], removeLabels = [] }) =>
      !newLabels.some((label) => removeLabels.includes(label)),
    {
      message: "A label cannot be in both newLabels and removeLabels",
      path: ["removeLabels"],
    },
  );

/**
 * updatePromptLabels tool definition and handler
 */
export const [updatePromptLabelsTool, handleUpdatePromptLabels] = defineTool({
  name: "updatePromptLabels",
  description: [
    "Add or remove labels on one prompt version; returns the version's resulting labels. Get version numbers from listPrompts or getPrompt. Content, type and tags cannot be changed here; create a new version with createTextPrompt or createChatPrompt.",
    "",
    "- A label is unique per prompt: adding it here removes it from the version that held it. Other labels on this version are kept.",
    "- 'latest' is auto-managed and cannot be added or removed.",
    "- Add or remove 'production' only when the user explicitly asks. SDK clients fetch the 'production' version by default, so moving or removing it changes or breaks what applications receive.",
  ].join("\n"),
  action: "prompts:CUD",
  baseSchema: UpdatePromptLabelsBaseSchema,
  inputSchema: UpdatePromptLabelsInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.prompts.update_labels",
      context,
      attributes: {
        "mcp.prompt_name": input.name,
        "mcp.prompt_version": input.version,
        "mcp.new_labels_count": input.newLabels?.length ?? 0,
        "mcp.remove_labels_count": input.removeLabels?.length ?? 0,
      },
      fn: async () => {
        const { name, version, newLabels = [], removeLabels = [] } = input;

        const { updatedPrompt } = await updatePromptLabelsForApi({
          context,
          ctx: context.auth,
          promptName: name,
          promptVersion: version,
          newLabels,
          removeLabels,
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
  annotations: { destructiveHint: true },
});
