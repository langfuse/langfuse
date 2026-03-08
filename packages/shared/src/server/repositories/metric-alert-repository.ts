import { queryClickhouse } from "./clickhouse";
import { logger } from "../logger";

export const getFailureRateForWindow = async ({
  projectId,
  lookbackWindowMinutes,
}: {
  projectId: string;
  lookbackWindowMinutes: number;
}): Promise<number> => {
  const result = await queryClickhouse<{ failure_rate: string }>({
    query: `
      SELECT
        countIf(level = 'ERROR') / count() AS failure_rate
      FROM traces FINAL
      WHERE project_id = {projectId: String}
        AND timestamp >= now() - INTERVAL {lookbackWindowMinutes: Int32} MINUTE
    `,
    params: { projectId, lookbackWindowMinutes },
  });

  const row = result[0];
  if (!row) {
    logger.debug("[MetricAlert] No trace data found for failure_rate", {
      projectId,
      lookbackWindowMinutes,
    });
    return 0;
  }
  return parseFloat(row.failure_rate);
};

export const getP99LatencyForWindow = async ({
  projectId,
  lookbackWindowMinutes,
}: {
  projectId: string;
  lookbackWindowMinutes: number;
}): Promise<number> => {
  const result = await queryClickhouse<{ p99_latency_ms: string }>({
    query: `
      SELECT
        quantile(0.99)(
          date_diff('millisecond', start_time, end_time)
        ) AS p99_latency_ms
      FROM observations FINAL
      WHERE project_id = {projectId: String}
        AND start_time >= now() - INTERVAL {lookbackWindowMinutes: Int32} MINUTE
        AND end_time IS NOT NULL
    `,
    params: { projectId, lookbackWindowMinutes },
  });

  const row = result[0];
  if (!row || row.p99_latency_ms == null) {
    logger.debug("[MetricAlert] No observation data found for p99_latency_ms", {
      projectId,
      lookbackWindowMinutes,
    });
    return 0;
  }
  const value = parseFloat(row.p99_latency_ms);
  return isNaN(value) ? 0 : value;
};

export const getTotalCostForWindow = async ({
  projectId,
  lookbackWindowMinutes,
}: {
  projectId: string;
  lookbackWindowMinutes: number;
}): Promise<number> => {
  const result = await queryClickhouse<{ total_cost_usd: string }>({
    query: `
      SELECT
        sum(total_cost) AS total_cost_usd
      FROM observations FINAL
      WHERE project_id = {projectId: String}
        AND start_time >= now() - INTERVAL {lookbackWindowMinutes: Int32} MINUTE
    `,
    params: { projectId, lookbackWindowMinutes },
  });

  const row = result[0];
  if (!row || row.total_cost_usd == null) {
    logger.debug("[MetricAlert] No observation data found for total_cost_usd", {
      projectId,
      lookbackWindowMinutes,
    });
    return 0;
  }
  const value = parseFloat(row.total_cost_usd);
  return isNaN(value) ? 0 : value;
};

export const getAvgScoreForWindow = async ({
  projectId,
  lookbackWindowMinutes,
  scoreName,
}: {
  projectId: string;
  lookbackWindowMinutes: number;
  scoreName: string;
}): Promise<number> => {
  const result = await queryClickhouse<{ avg_score: string }>({
    query: `
      SELECT
        avg(value) AS avg_score
      FROM scores FINAL
      WHERE project_id = {projectId: String}
        AND name = {scoreName: String}
        AND timestamp >= now() - INTERVAL {lookbackWindowMinutes: Int32} MINUTE
    `,
    params: { projectId, lookbackWindowMinutes, scoreName },
  });

  const row = result[0];
  if (!row || row.avg_score == null) {
    logger.debug("[MetricAlert] No score data found for avg_score", {
      projectId,
      lookbackWindowMinutes,
      scoreName,
    });
    return 0;
  }
  const value = parseFloat(row.avg_score);
  return isNaN(value) ? 0 : value;
};
