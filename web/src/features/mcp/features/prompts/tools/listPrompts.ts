/**
 * MCP Tool: listPrompts
 *
 * Lists and filters prompts in the project.
 * Read-only operation.
 */

import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import {
  ParamPromptName,
  ParamPromptLabel,
  ParamPromptTag,
} from "../validation";
import { ParamLimit, ParamPage } from "../../../core/validation";
import { listPromptsForApi } from "@/src/features/prompts/server/prompt-api-service";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";

const ParamFromUpdatedAt = z.iso
  .datetime({ offset: true })
  .optional()
  .describe(
    "Filter prompts updated at or after this timestamp (ISO 8601 with timezone, e.g. 2026-02-02T00:00:00Z)",
  );

const ParamToUpdatedAt = z.iso
  .datetime({ offset: true })
  .optional()
  .describe(
    "Filter prompts updated at or before this timestamp (ISO 8601 with timezone, e.g. 2026-02-02T00:00:00Z)",
  );

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
  fromUpdatedAt: ParamFromUpdatedAt,
  toUpdatedAt: ParamToUpdatedAt,
  page: ParamPage,
  limit: ParamLimit,
});

/**
 * Full input schema with runtime validations
 */
const ListPromptsInputSchema = ListPromptsBaseSchema.superRefine(
  (data, ctx) => {
    if (data.fromUpdatedAt && data.toUpdatedAt) {
      const fromMs = Date.parse(data.fromUpdatedAt);
      const toMs = Date.parse(data.toUpdatedAt);

      if (Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs > toMs) {
        ctx.addIssue({
          code: "custom",
          path: ["fromUpdatedAt"],
          message: "fromUpdatedAt must be <= toUpdatedAt",
        });
      }
    }
  },
);

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
    "- fromUpdatedAt: Filter prompts updated at or after this timestamp",
    "- toUpdatedAt: Filter prompts updated at or before this timestamp",
    "",
    "Pagination: page (default: 1), limit (default: 50, max: 100)",
  ].join("\n"),
  baseSchema: ListPromptsBaseSchema,
  inputSchema: ListPromptsInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.prompts.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page ?? 1,
        "mcp.pagination_limit": input.limit ?? 50,
        "mcp.filter_name": input.name,
        "mcp.filter_label": input.label,
        "mcp.filter_tag": input.tag,
        "mcp.filter_fromUpdatedAt": input.fromUpdatedAt,
        "mcp.filter_toUpdatedAt": input.toUpdatedAt,
      },
      fn: async (span) => {
        const { name, label, tag, fromUpdatedAt, toUpdatedAt, page, limit } =
          input;

        // Fetch prompts metadata using existing service
        const result = await listPromptsForApi({
          projectId: context.projectId, // Auto-injected from authenticated API key
          name,
          label,
          tag,
          fromUpdatedAt,
          toUpdatedAt,
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
          meta: paginationMeta({
            page: result.pagination.page,
            limit: result.pagination.limit,
            totalItems: result.pagination.totalItems,
          }),
        };
      },
    });
  },
  readOnlyHint: true,
});
