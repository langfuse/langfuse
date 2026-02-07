/**
 * MCP Tool: listPromptVersions
 *
 * Lists versions for a specific prompt name in the project.
 * Read-only operation intended to avoid N+1 calls (listPrompts -> getPrompt per version).
 */

import { z } from "zod/v4";
import { defineTool } from "../../../core/define-tool";
import { ParamPromptName } from "../validation";
import { ParamLimit, ParamPage } from "../../../core/validation";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";
import { prisma } from "@langfuse/shared/src/db";

/**
 * Base schema for JSON Schema generation (no refinements needed)
 */
const ListPromptVersionsBaseSchema = z.object({
  name: ParamPromptName.describe("The prompt name to list versions for"),
  page: ParamPage,
  limit: ParamLimit,
});

export const [listPromptVersionsTool, handleListPromptVersions] = defineTool({
  name: "listPromptVersions",
  description: [
    "List versions for a single prompt name (metadata only).",
    "",
    "Use this to avoid calling getPrompt N times when you just need version history and labels/tags.",
    "",
    "Returns versions sorted by version number descending. Does NOT include prompt content.",
    "",
    "Pagination: page (default: 1), limit (default: 50, max: 100)",
  ].join("\n"),
  baseSchema: ListPromptVersionsBaseSchema,
  inputSchema: ListPromptVersionsBaseSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.prompts.list_versions", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { name, page, limit } = input;

        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.prompt_name": name,
          "mcp.pagination_page": page ?? 1,
          "mcp.pagination_limit": limit ?? 50,
        });

        // Same pagination semantics as listPrompts/getPromptsMeta (OFFSET = limit * (page - 1))
        const [promptVersions, totalItems] = await Promise.all([
          prisma.prompt.findMany({
            where: {
              projectId: context.projectId,
              name,
            },
            select: {
              id: true,
              name: true,
              version: true,
              type: true,
              labels: true,
              tags: true,
              createdAt: true,
              updatedAt: true,
              createdBy: true,
              commitMessage: true,
            },
            orderBy: [{ version: "desc" }],
            take: limit,
            skip: limit * (page - 1),
          }),
          prisma.prompt.count({
            where: {
              projectId: context.projectId,
              name,
            },
          }),
        ]);

        span.setAttribute("mcp.result_count", promptVersions.length);

        const totalPages = Math.ceil(totalItems / limit);

        return {
          data: promptVersions.map((prompt) => ({
            id: prompt.id,
            name: prompt.name,
            version: prompt.version,
            type: prompt.type,
            labels: prompt.labels,
            tags: prompt.tags,
            createdAt: prompt.createdAt,
            updatedAt: prompt.updatedAt,
            createdBy: prompt.createdBy,
            commitMessage: prompt.commitMessage,
          })),
          pagination: {
            page,
            limit,
            totalPages,
            totalItems,
          },
        };
      },
    );
  },
  readOnlyHint: true,
});
