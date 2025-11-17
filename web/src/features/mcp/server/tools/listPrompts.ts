/**
 * MCP Tool: listPrompts
 *
 * Lists and filters prompts in the project.
 * Read-only operation.
 */

import { z } from "zod/v4";
import { defineTool } from "../../internal/define-tool";
import {
  ParamPromptName,
  ParamPromptLabel,
  ParamPromptTag,
  ParamLimit,
  ParamPage,
} from "../../internal/validation";
import { getPromptsMeta } from "@/src/features/prompts/server/actions/getPromptsMeta";

/**
 * Base schema for listPrompts tool (no refinements needed)
 */
const ListPromptsBaseSchema = z.object({
  name: ParamPromptName.optional().describe(
    "Filter by exact prompt name match",
  ),
  label: ParamPromptLabel.describe(
    "Filter by label (e.g., 'production', 'staging')",
  ),
  tag: ParamPromptTag.describe("Filter by tag (e.g., 'experimental', 'v1')"),
  page: ParamPage,
  limit: ParamLimit,
});

/**
 * listPrompts tool definition and handler
 */
export const [listPromptsTool, handleListPrompts] = defineTool({
  name: "listPrompts",
  description: [
    "List and filter prompts in the project.",
    "",
    "Returns metadata about prompts including:",
    "- All available versions",
    "- All labels applied to any version",
    "- Tags",
    "- Last updated timestamp",
    "- Prompt type (text or chat)",
    "",
    "**Filters** (all optional):",
    "- `name`: Filter by exact prompt name",
    "- `label`: Filter to prompts that have this label on any version",
    "- `tag`: Filter to prompts with this tag",
    "",
    "**Pagination:**",
    "- `page`: Page number (default: 1)",
    "- `limit`: Items per page (1-100, default: 50)",
    "",
    "**Examples:**",
    "- List all prompts: `{}`",
    "- List production prompts: `{label: 'production'}`",
    "- List experimental prompts: `{tag: 'experimental'}`",
    "- Get specific prompt metadata: `{name: 'chatbot'}`",
    "- Paginate results: `{page: 2, limit: 20}`",
  ].join("\n"),
  baseSchema: ListPromptsBaseSchema,
  inputSchema: ListPromptsBaseSchema, // No refinements, same as base
  handler: async (input, context) => {
    const { name, label, tag, page, limit } = input;

    // Fetch prompts metadata using existing service
    const result = await getPromptsMeta({
      projectId: context.projectId, // Auto-injected from authenticated API key
      name,
      label,
      tag,
      page, // Default handled by Zod schema
      limit, // Default handled by Zod schema
    });

    // Return formatted response
    return {
      data: result.data.map((prompt) => ({
        name: prompt.name,
        type: prompt.type,
        versions: prompt.versions,
        labels: prompt.labels,
        tags: prompt.tags,
        lastUpdatedAt: prompt.lastUpdatedAt,
        lastConfig: prompt.lastConfig,
      })),
      pagination: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        totalPages: result.pagination.totalPages,
        totalItems: result.pagination.totalItems,
      },
    };
  },
  readOnlyHint: true,
});
