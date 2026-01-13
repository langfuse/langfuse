/**
 * MCP Tool: getPrompt
 *
 * Fetches a specific prompt by name with optional label or version.
 * Read-only operation.
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import {
  ParamPromptName,
  ParamPromptLabel,
  ParamPromptVersion,
} from "../validation";
import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { UserInputError } from "../../../core/errors";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

/**
 * Base schema for JSON Schema generation (without refinements)
 */
const GetPromptBaseSchema = z.object({
  name: ParamPromptName,
  label: ParamPromptLabel,
  version: ParamPromptVersion,
});

/**
 * Full input schema with runtime validations
 */
const GetPromptInputSchema = GetPromptBaseSchema.refine(
  (data) => !(data.label && data.version),
  {
    message:
      "Cannot specify both label and version - they are mutually exclusive",
  },
);

/**
 * getPrompt tool definition and handler
 */
export const [getPromptTool, handleGetPrompt] = defineTool({
  name: "getPrompt",
  description: [
    "Fetch a specific prompt by name with optional label or version parameter.",
    "",
    "Retrieval options:",
    "- label: Get prompt with specific label (e.g., 'production', 'staging')",
    "- version: Get specific version number (e.g., 1, 2, 3)",
    "- neither: Returns 'production' version by default",
    "",
    "Note: label and version are mutually exclusive. Returns full prompt content with resolved dependencies.",
  ].join("\n"),
  baseSchema: GetPromptBaseSchema,
  inputSchema: GetPromptInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.get", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { name, label, version } = input;

        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": name,
        });

        if (label) {
          span.setAttribute("mcp.prompt_label", label);
        }
        if (version) {
          span.setAttribute("mcp.prompt_version", version);
        }

        // Fetch prompt using existing service
        const prompt = await getPromptByName({
          promptName: name,
          projectId: context.projectId, // Auto-injected from authenticated API key
          label,
          version,
        });

        if (!prompt) {
          throw new UserInputError(
            `Prompt '${name}' not found${label ? ` with label '${label}'` : ""}${version ? ` with version ${version}` : ""}`,
          );
        }

        // Return formatted response
        return {
          id: prompt.id,
          name: prompt.name,
          version: prompt.version,
          type: prompt.type,
          prompt: prompt.prompt,
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
