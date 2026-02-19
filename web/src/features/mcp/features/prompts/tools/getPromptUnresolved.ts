/**
 * MCP Tool: getPromptUnresolved
 *
 * Fetches a specific prompt by name with optional label or version WITHOUT resolving dependencies.
 * Returns the raw prompt content with dependency tags intact for prompt composition/stacking analysis.
 * Read-only operation.
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import {
  ParamPromptName,
  ParamPromptLabel,
  ParamPromptVersion,
} from "../validation";
import { UserInputError } from "../../../core/errors";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";
import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";

/**
 * Base schema for JSON Schema generation (without refinements)
 */
const GetPromptUnresolvedBaseSchema = z.object({
  name: ParamPromptName,
  label: ParamPromptLabel,
  version: ParamPromptVersion,
});

/**
 * Full input schema with runtime validations
 */
const GetPromptUnresolvedInputSchema = GetPromptUnresolvedBaseSchema.refine(
  (data) => !(data.label && data.version),
  {
    message:
      "Cannot specify both label and version - they are mutually exclusive",
  },
);

/**
 * getPromptUnresolved tool definition and handler
 */
export const [getPromptUnresolvedTool, handleGetPromptUnresolved] = defineTool({
  name: "getPromptUnresolved",
  description: [
    "Fetch a specific prompt by name with optional label or version parameter WITHOUT resolving dependencies.",
    "",
    "Returns the raw prompt content with dependency tags intact. Useful for:",
    "- Understanding prompt composition/stacking before resolution",
    "- Debugging prompt dependencies",
    "- Analyzing the dependency graph structure",
    "",
    "Retrieval options:",
    "- label: Get prompt with specific label (e.g., 'production', 'staging')",
    "- version: Get specific version number (e.g., 1, 2, 3)",
    "- neither: Returns 'production' version by default",
    "",
    "Note: label and version are mutually exclusive. To get resolved prompts, use the 'getPrompt' tool instead.",
  ].join("\n"),
  baseSchema: GetPromptUnresolvedBaseSchema,
  inputSchema: GetPromptUnresolvedInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.getUnresolved", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { name, label, version } = input;

        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": name,
          "mcp.unresolved": true,
        });

        if (label) {
          span.setAttribute("mcp.prompt_label", label);
        }
        if (version) {
          span.setAttribute("mcp.prompt_version", version);
        }

        // Fetch prompt without resolving dependencies using service layer
        const prompt = await getPromptByName({
          promptName: name,
          projectId: context.projectId,
          version,
          label,
          resolve: false, // Fetch raw prompt without resolving dependency tags
        });

        if (!prompt) {
          throw new UserInputError(
            `Prompt '${name}' not found${label ? ` with label '${label}'` : ""}${version ? ` with version ${version}` : ""}`,
          );
        }

        // Return formatted response with raw (unresolved) prompt content
        return {
          id: prompt.id,
          name: prompt.name,
          version: prompt.version,
          type: prompt.type,
          prompt: prompt.prompt, // RAW prompt with dependency tags intact
          labels: prompt.labels,
          tags: prompt.tags,
          config: prompt.config,
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
          createdBy: prompt.createdBy,
          projectId: prompt.projectId,
        };
      },
    );
  },
  readOnlyHint: true,
});
