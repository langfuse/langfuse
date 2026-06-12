import { ScoreDataTypeType, ScoreDomain, ScoreSourceType } from "../../domain";
import { PreferredClickhouseService } from "../clickhouse/client";
import * as greptimeScoreReads from "./greptime/scores";

/**
 * @internal
 * Internal utility for getting a score by ID. Reads the GreptimeDB projection (04-read-path.md, P1);
 * the `preferredClickhouseService` parameter is retained for signature compatibility and ignored.
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoreById = (params: {
  projectId: string;
  scoreId: string;
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  scoreDataTypes?: readonly ScoreDataTypeType[];
  preferredClickhouseService?: PreferredClickhouseService;
}): Promise<ScoreDomain | undefined> =>
  greptimeScoreReads._handleGetScoreById(params);

/**
 * @internal
 * Internal utility for getting scores by ID. Reads the GreptimeDB projection (04-read-path.md, P1).
 * Do not use directly - use ScoresApiService or repository functions instead.
 */
export const _handleGetScoresByIds = (params: {
  projectId: string;
  scoreId: string[];
  source?: ScoreSourceType;
  scoreScope: "traces_only" | "all";
  dataTypes?: readonly ScoreDataTypeType[];
}): Promise<ScoreDomain[]> => greptimeScoreReads._handleGetScoresByIds(params);
