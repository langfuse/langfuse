import { TOPICS_MAX_TIME_RANGE_MS } from "../../topics";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { queryClickhouse } from "./clickhouse";

/**
 * Topics facet summaries are billable units like traces, observations and
 * scores: one unit per stored summary row, counted by `processed_at`, the time
 * the row was written. Every processing state is billed.
 *
 * Summaries of a source are processed after it starts, so the scan is bounded
 * by `unit_start_time` within the longest Topics time range before the window.
 * A summary written for an older source is not counted.
 *
 * Within one count, rows of the same source, facet and facet version count
 * once, so a duplicate write is not billed twice. A re-summary in a later
 * window is a new unit. `topic_facet_summaries` is a ReplacingMergeTree and
 * trace deletion removes rows, so recounting a past window can return less.
 */
export const BILLABLE_TOPIC_FACET_SUMMARY_SQL = {
  unit: "(trace_id, session_id, facet_id, facet_version)",
  condition: `processed_at >= {start: DateTime64(3)}
    AND processed_at < {end: DateTime64(3)}
    AND unit_start_time >= {sourcesFrom: DateTime64(3)}
    AND unit_start_time < {end: DateTime64(3)}`,
};

export const billableTopicFacetSummaryParams = ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) => ({
  start: convertDateToClickhouseDateTime(start),
  end: convertDateToClickhouseDateTime(end),
  sourcesFrom: convertDateToClickhouseDateTime(
    new Date(start.getTime() - TOPICS_MAX_TIME_RANGE_MS),
  ),
});

export const getTopicFacetSummaryCountsByProjectInCreationInterval = async ({
  start,
  end,
  projectId,
  projectIds,
}: {
  start: Date;
  end: Date;
  projectId?: string;
  projectIds?: string[];
}) => {
  const query = `
    SELECT
      project_id,
      uniqExact${BILLABLE_TOPIC_FACET_SUMMARY_SQL.unit} AS count
    FROM topic_facet_summaries
    WHERE ${BILLABLE_TOPIC_FACET_SUMMARY_SQL.condition}
    ${projectId ? "AND project_id = {projectId: String}" : ""}
    ${projectIds ? "AND project_id IN ({projectIds: Array(String)})" : ""}
    GROUP BY project_id
  `;

  const rows = await queryClickhouse<{ project_id: string; count: string }>({
    query,
    params: {
      ...billableTopicFacetSummaryParams({ start, end }),
      ...(projectId ? { projectId } : {}),
      ...(projectIds ? { projectIds } : {}),
    },
    clickhouseConfigs: {
      request_timeout: 300000, // 5 minutes timeout
    },
    ...(projectId ? { tags: { projectId } } : {}),
  });

  return rows.map((row) => ({
    projectId: row.project_id,
    count: Number(row.count),
  }));
};

/** Billable facet summaries per project and UTC day of `processed_at`. */
export const getTopicFacetSummaryCountsByProjectAndDay = async ({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) => {
  const query = `
    SELECT
      uniqExact${BILLABLE_TOPIC_FACET_SUMMARY_SQL.unit} AS count,
      project_id,
      toDate(processed_at) AS date
    FROM topic_facet_summaries
    WHERE ${BILLABLE_TOPIC_FACET_SUMMARY_SQL.condition}
    GROUP BY project_id, toDate(processed_at)
  `;

  const rows = await queryClickhouse<{
    count: string;
    project_id: string;
    date: string;
  }>({
    query,
    params: billableTopicFacetSummaryParams({
      start: startDate,
      end: endDate,
    }),
    clickhouseConfigs: { request_timeout: 120_000 },
  });

  return rows.map((row) => ({
    count: Number(row.count),
    projectId: row.project_id,
    date: row.date,
  }));
};
