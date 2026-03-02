/**
 * Logic mirrors repositories/scores-utils.ts (ClickHouse); syntax adapted for OceanBase.
 * Same exports: _handleGetScoreById, _handleGetScoresByIds.
 */
import {
  ScoreDataTypeType,
  ScoreDomain,
  ScoreSourceType,
} from "../../domain/scores";
import { DatabaseAdapterFactory } from "../database";
import { ScoreRecordReadType } from "../repositories/definitions";
import { convertClickhouseScoreToDomain } from "../repositories/scores_converters";

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoreById = async ({
  projectId,
  scoreId,
  source,
  scoreScope,
  scoreDataTypes,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  scoreDataTypes?: readonly ScoreDataTypeType[];
}): Promise<ScoreDomain | undefined> => {
  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      WHERE s.project_id = ?
      AND s.id = ?
      ${scoreDataTypes?.length ? `AND s.data_type IN (${scoreDataTypes.map(() => "?").join(", ")})` : ""}
      ${source ? `AND s.source = ?` : ""}
      ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
    LIMIT 1
  `;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [projectId, scoreId];
  if (scoreDataTypes?.length) {
    params.push(...scoreDataTypes.map((d) => d.toString()));
  }
  if (source !== undefined) {
    params.push(source);
  }

  const rows = await adapter.queryWithOptions<ScoreRecordReadType>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "score",
      kind: "byId",
      projectId,
    },
  });
  return rows.map((row) => convertClickhouseScoreToDomain(row)).shift();
};

/**
 * @internal
 * Internal utility function for getting scores by ID.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoresByIds = async ({
  projectId,
  scoreId,
  source,
  scoreScope,
  dataTypes,
}: {
  projectId: string;
  scoreId: string[];
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  dataTypes?: readonly ScoreDataTypeType[];
}): Promise<ScoreDomain[]> => {
  // Handle empty scoreId array by using 1=0 condition to avoid SQL syntax error with IN ()
  const scoreIdCondition =
    scoreId.length === 0
      ? "AND 1=0"
      : `AND s.id IN (${scoreId.map(() => "?").join(", ")})`;

  const query = `
    SELECT *
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      WHERE s.project_id = ?
      ${scoreIdCondition}
      ${dataTypes?.length ? `AND s.data_type IN (${dataTypes.map(() => "?").join(", ")})` : ""}
      ${source ? `AND s.source = ?` : ""}
      ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
    ) ranked
    WHERE rn = 1
    ORDER BY \`event_ts\` DESC
  `;

  const adapter = DatabaseAdapterFactory.getInstance();
  const params: unknown[] = [projectId, ...scoreId];
  if (dataTypes?.length) {
    params.push(...dataTypes.map((d) => d.toString()));
  }
  if (source !== undefined) {
    params.push(source);
  }

  const rows = await adapter.queryWithOptions<ScoreRecordReadType>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "score",
      kind: "byId",
      projectId,
    },
  });
  return rows.map((row) => convertClickhouseScoreToDomain(row));
};
