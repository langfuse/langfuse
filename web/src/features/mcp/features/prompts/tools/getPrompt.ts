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
    "Fetch a specific prompt by name.",
    "",
    "You can retrieve a prompt by:",
    "- **Label**: Get the prompt with a specific label (e.g., 'production', 'staging')",
    "- **Version**: Get a specific version number (e.g., 1, 2, 3)",
    "- **Default**: If neither label nor version is specified, returns the 'production' version",
    "",
    "⚠️ **Note**: `label` and `version` are mutually exclusive - specify only one.",
    "",
    "**Examples:**",
    "- Get production prompt: `{name: 'chatbot'}`",
    "- Get staging prompt: `{name: 'chatbot', label: 'staging'}`",
    "- Get specific version: `{name: 'chatbot', version: 3}`",
    "",
    "**Returns:** Full prompt content including compiled templates with resolved dependencies.",
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
  readOnly: true,
});
