import { SpanKind } from "@opentelemetry/api";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { listScoreConfigs } from "@/src/features/public-api/server/score-configs-api-service";
import { GetScoreConfigsQuery } from "@/src/features/public-api/types/score-configs";

export const [listScoreConfigsTool, handleListScoreConfigs] = defineTool({
  name: "listScoreConfigs",
  description:
    "List score configurations in the current Langfuse project. Returns exactly data and meta at the top level.",
  baseSchema: GetScoreConfigsQuery,
  inputSchema: GetScoreConfigsQuery,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.score_configs.list", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        });

        const result = await listScoreConfigs({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        span.setAttribute("mcp.result_count", result.data.length);
        return result;
      },
    );
  },
  readOnlyHint: true,
});
