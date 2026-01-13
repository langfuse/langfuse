/**
 * MCP Tool: listPrompts
 *
 * Lists and filters prompts in the project.
 * Read-only operation.
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import {
  ParamPromptName,
  ParamPromptLabel,
  ParamPromptTag,
} from "../validation";
import { ParamLimit, ParamPage } from "../../../core/validation";
import { getPromptsMeta } from "@/src/features/prompts/server/actions/getPromptsMeta";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

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
    "List and filter prompts in the project. Returns metadata including versions, labels, tags, last updated timestamp, and prompt type.",
    "",
    "Optional filters:",
    "- name: Filter by exact prompt name",
    "- label: Filter by label on any version",
    "- tag: Filter by tag",
    "",
    "Pagination: page (default: 1), limit (default: 50, max: 100)",
  ].join("\n"),
  baseSchema: ListPromptsBaseSchema,
  inputSchema: ListPromptsBaseSchema, // No refinements, same as base
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.list", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { name, label, tag, page, limit } = input;

        // Set span attributes for observability
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.pagination_page": page ?? 1,
          "mcp.pagination_limit": limit ?? 50,
        });

        if (name) {
          span.setAttribute("mcp.filter_name", name);
        }
        if (label) {
          span.setAttribute("mcp.filter_label", label);
        }
        if (tag) {
          span.setAttribute("mcp.filter_tag", tag);
        }

        // Fetch prompts metadata using existing service
        const result = await getPromptsMeta({
          projectId: context.projectId, // Auto-injected from authenticated API key
          name,
          label,
          tag,
          page, // Default handled by Zod schema
          limit, // Default handled by Zod schema
        });

        // Set result count for observability
        span.setAttribute("mcp.result_count", result.data.length);

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
    );
  },
  readOnlyHint: true,
});
