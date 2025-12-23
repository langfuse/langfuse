import {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  convertScoreToPublicApi,
  type ScoreQueryType,
} from "@/src/features/public-api/server/scores";
import {
  AGGREGATABLE_SCORE_TYPES,
  type ScoreSourceType,
} from "@langfuse/shared";
import { _handleGetScoreById } from "@langfuse/shared/src/server";

export class ScoresApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  /**
   * Get a specific score by ID
   * v1: Only returns aggregatable scores (NUMERIC, BOOLEAN, CATEGORICAL) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION
   */
  async getScoreById({
    projectId,
    scoreId,
    source,
  }: {
    projectId: string;
    scoreId: string;
    source?: ScoreSourceType;
  }) {
    const score = await _handleGetScoreById({
      projectId,
      scoreId,
      source,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? AGGREGATABLE_SCORE_TYPES : undefined,
      preferredClickhouseService: "ReadOnly",
    });

    if (!score) {
      return undefined;
    }

    return convertScoreToPublicApi(score);
  }

  /**
   * Get list of scores with version-aware filtering
   * v1: Only returns aggregatable scores (NUMERIC, BOOLEAN, CATEGORICAL) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION
   */
  async generateScoresForPublicApi(props: ScoreQueryType) {
    return _handleGenerateScoresForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? AGGREGATABLE_SCORE_TYPES : undefined,
    });
  }

  /**
   * Get count of scores with version-aware filtering
   * v1: Only counts aggregatable scores (NUMERIC, BOOLEAN, CATEGORICAL) - excludes CORRECTION
   * v2: Counts all score types including CORRECTION
   */
  async getScoresCountForPublicApi(props: ScoreQueryType) {
    return _handleGetScoresCountForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? AGGREGATABLE_SCORE_TYPES : undefined,
    });
  }
}
