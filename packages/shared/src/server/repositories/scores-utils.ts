import { ScoreDomain, ScoreSourceType } from "../../domain";
import { PreferredClickhouseService } from "../clickhouse/client";
import { queryClickhouse } from "./clickhouse";
import { ScoreRecordReadType } from "./definitions";
import { convertClickhouseScoreToDomain } from "./scores_converters";

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
  preferredClickhouseService,
}: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  preferredClickhouseService?: PreferredClickhouseService;
}): Promise<ScoreDomain | undefined> => {
  const query = `
  SELECT *
  FROM scores s
  WHERE s.project_id = {projectId: String}
  AND s.id = {scoreId: String}
  ${source ? `AND s.source = {source: String}` : ""}
  ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
  ORDER BY s.event_ts DESC
  LIMIT 1 BY s.id, s.project_id
  LIMIT 1
`;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query,
    params: {
      projectId,
      scoreId,
      ...(source !== undefined ? { source } : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "byId",
      projectId,
    },
    preferredClickhouseService,
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
}: {
  projectId: string;
  scoreId: string[];
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
}): Promise<ScoreDomain[]> => {
  const query = `
  SELECT *
  FROM scores s
  WHERE s.project_id = {projectId: String}
  AND s.id IN ({scoreId: Array(String)})
  ${source ? `AND s.source = {source: String}` : ""}
  ${scoreScope === "traces_only" ? "AND s.session_id IS NULL AND s.dataset_run_id IS NULL" : ""}
  ORDER BY s.event_ts DESC
  LIMIT 1 BY s.id, s.project_id
`;

  const rows = await queryClickhouse<ScoreRecordReadType>({
    query,
    params: {
      projectId,
      scoreId,
      ...(source !== undefined ? { source } : {}),
    },
    tags: {
      feature: "tracing",
      type: "score",
      kind: "byId",
      projectId,
    },
  });
  return rows.map((row) => convertClickhouseScoreToDomain(row));
};
