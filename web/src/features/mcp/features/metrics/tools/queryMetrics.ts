import { InvalidRequestError } from "@langfuse/shared";
import { executeQuery } from "@langfuse/shared/query/server";
import { validateQuery } from "@langfuse/shared/query";
import { MetricsQueryObjectV2 } from "@/src/features/public-api/types/metrics";
import { defineTool } from "../../../core/define-tool";

const DEFAULT_ROW_LIMIT = 100;

export const [queryMetricsTool, handleQueryMetrics] = defineTool({
  name: "queryMetrics",
  description:
    "Answer analytics questions about the current Langfuse project, such as usage over time, model costs, latency, errors, scores, or grouped breakdowns by environment, trace, observation, model, user, session, tag, or score name.",
  baseSchema: MetricsQueryObjectV2,
  inputSchema: MetricsQueryObjectV2,
  handler: async (input, context) => {
    const validation = validateQuery(input, "v2");

    if (!validation.valid) {
      throw new InvalidRequestError(validation.reason);
    }

    const { config, ...query } = input;
    const queryParams = {
      ...query,
      chartConfig: {
        type: "TABLE",
        ...config,
        row_limit: config?.row_limit ?? DEFAULT_ROW_LIMIT,
      },
    };

    const result = await executeQuery(
      context.projectId,
      queryParams,
      "v2",
      true,
    );

    return { data: result };
  },
  readOnlyHint: true,
});
