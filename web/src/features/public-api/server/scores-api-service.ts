import {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  type ScoreQueryType,
} from "@/src/features/public-api/server/scores";
import { type ScoreSourceType } from "@langfuse/shared";
import { _handleGetScoreById } from "@langfuse/shared/src/server";

export class ScoresApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  /**
   * Get a specific score by ID
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
    return _handleGetScoreById({
      projectId,
      scoreId,
      source,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }

  /**
   * Get list of scores with version-aware filtering
   */
  async generateScoresForPublicApi(props: ScoreQueryType) {
    return _handleGenerateScoresForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }

  /**
   * Get count of scores with version-aware filtering
   */
  async getScoresCountForPublicApi(props: ScoreQueryType) {
    return _handleGetScoresCountForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }
}
