import { prisma } from "../../../db";
import { env } from "../../../env";
import { buildEvalsPath } from "../../../utils/productUrl";
import { convertDateToClickhouseDateTime } from "../../../server/clickhouse/client";
import { EventsQueryBuilder } from "../../../server/queries/clickhouse-sql/event-query-builder";
import { queryClickhouse } from "../../../server/repositories/clickhouse";
import type { AdminIssueDefinition } from "../adminIssueDefinitions";

export const observationsWithoutEvaluatorsRule = {
  id: "observations-without-evaluators",
  name: "Set up evaluators",
  group: "evaluations",
  callback: async (projectId) => {
    const evaluator = await prisma.evaluator.findFirst({
      where: { projectId },
      select: { id: true },
    });
    if (evaluator) return [];

    const now = Date.now();
    const params = {
      projectId,
      since: convertDateToClickhouseDateTime(
        new Date(now - 30 * 24 * 60 * 60 * 1000),
      ),
      until: convertDateToClickhouseDateTime(new Date(now)),
    };
    const useEvents = env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only";
    const query = useEvents
      ? new EventsQueryBuilder({ projectId })
          .selectRaw("1 AS found")
          .whereRaw("e.start_time >= {since: DateTime64(3)}", {
            since: params.since,
          })
          .whereRaw("e.start_time <= {until: DateTime64(3)}", {
            until: params.until,
          })
          .whereRaw("e.is_deleted = 0")
          .limit(1)
          .buildWithParams()
      : {
          query: `SELECT 1 AS found FROM observations
            WHERE project_id = {projectId: String}
              AND start_time >= {since: DateTime64(3)}
              AND start_time <= {until: DateTime64(3)}
            LIMIT 1`,
          params,
        };
    const observations = await queryClickhouse<{ found: number }>({
      ...query,
      tags: { projectId },
      preferredClickhouseService: useEvents ? "EventsReadOnly" : "ReadOnly",
      clickhouseSettings: { max_threads: 1 },
    });

    if (observations.length === 0) return [];

    return [
      {
        description:
          "Set up evaluators to monitor your observations. [Get started](https://langfuse.com/docs/evaluation/get-started/online).",
        priority: 3,
        ctaLink: buildEvalsPath({ projectId }),
      },
    ];
  },
} as const satisfies AdminIssueDefinition;
