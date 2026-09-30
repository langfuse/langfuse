import { env } from "../../../env";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { EventsQueryBuilder } from "../../../server/queries/clickhouse-sql/event-query-builder";
import { queryClickhouse } from "../../../server/repositories/clickhouse";
import { buildTracePath } from "../../../utils/productUrl";
import type { AdminIssueDefinition, RuleIssue } from "../adminIssueDefinitions";

const LOOKBACK_DAYS = 30;
const EXAMPLES_PER_MODEL = 3;

type UnpricedGeneration = {
  model_name: string;
  trace_id: string;
  observation_id: string;
  start_time: string;
};

export const generationsWithoutModelPricingRule = {
  id: "generations-without-model-pricing",
  name: "Add pricing for unpriced generations",
  group: "integration",
  ctaLabel: "View generation",
  callback: async (projectId): Promise<RuleIssue[]> => {
    const now = Date.now();
    const params = {
      projectId,
      since: convertDateToClickhouseDateTime(
        new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      ),
      until: convertDateToClickhouseDateTime(new Date(now)),
    };
    const useEvents = env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only";
    const query = useEvents
      ? new EventsQueryBuilder({ projectId })
          .selectRaw(
            "e.provided_model_name AS model_name",
            "e.trace_id AS trace_id",
            "e.span_id AS observation_id",
            "e.start_time AS start_time",
          )
          .whereRaw("e.start_time >= {since: DateTime64(3)}", {
            since: params.since,
          })
          .whereRaw("e.start_time <= {until: DateTime64(3)}", {
            until: params.until,
          })
          .whereRaw("e.type = 'GENERATION'")
          .whereRaw("e.is_deleted = 0")
          .whereRaw("e.provided_model_name != ''")
          .whereRaw("e.model_id = ''")
          .whereRaw("arraySum(mapValues(e.usage_details)) > 0")
          .whereRaw("NOT mapContains(e.cost_details, 'total')")
          .orderByDefault()
          .limitByCount(EXAMPLES_PER_MODEL, "e.provided_model_name")
          .buildWithParams()
      : {
          query: `SELECT
              provided_model_name AS model_name,
              trace_id,
              id AS observation_id,
              start_time
            FROM observations
            WHERE project_id = {projectId: String}
              AND start_time >= {since: DateTime64(3)}
              AND start_time <= {until: DateTime64(3)}
              AND type = 'GENERATION'
              AND provided_model_name IS NOT NULL
              AND provided_model_name != ''
              AND internal_model_id IS NULL
              AND arraySum(mapValues(usage_details)) > 0
              AND NOT mapContains(cost_details, 'total')
            ORDER BY start_time DESC
            LIMIT ${EXAMPLES_PER_MODEL} BY provided_model_name`,
          params,
        };

    const rows = await queryClickhouse<UnpricedGeneration>({
      ...query,
      tags: { projectId },
      preferredClickhouseService: useEvents ? "EventsReadOnly" : "ReadOnly",
      clickhouseSettings: { max_threads: 1 },
    });

    const byModel = new Map<string, string[]>();
    for (const row of rows) {
      const links = byModel.get(row.model_name) ?? [];
      links.push(
        buildTracePath({
          projectId,
          traceId: row.trace_id,
          observationId: row.observation_id,
          timestamp: `${row.start_time.replace(" ", "T")}Z`,
        }),
      );
      byModel.set(row.model_name, links);
    }

    return [...byModel].map(([modelName, links]) => ({
      description: `Generations using model \`${modelName.replaceAll("`", "\\`")}\` have token usage but no matched model definition or tracked cost. Add a model definition with pricing to track their cost. Recent observations: ${links.map((link, index) => `[${index + 1}](${link})`).join(", ")}.`,
      priority: 3,
      ctaLink: links[0],
    }));
  },
} as const satisfies AdminIssueDefinition;
