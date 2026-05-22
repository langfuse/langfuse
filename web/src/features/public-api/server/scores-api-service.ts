import { randomUUID } from "crypto";

import {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  convertScoreToPublicApi,
  type ScoreQueryType,
} from "@/src/features/public-api/server/scores";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  InternalServerError,
  LISTABLE_SCORE_TYPES,
  type ScoreSourceType,
  type PostScoresBodyV1,
} from "@langfuse/shared";
import {
  _handleGetScoreById,
  eventTypes,
  processEventBatch,
  QueueJobs,
  ScoreDeleteQueue,
  type AuthHeaderValidVerificationResultIngestion,
} from "@langfuse/shared/src/server";
import type { z } from "zod";

export class ScoresApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  async createScore({
    body,
    auth,
    scoreId = body.id ?? randomUUID(),
  }: {
    body: z.infer<typeof PostScoresBodyV1>;
    auth: AuthHeaderValidVerificationResultIngestion;
    scoreId?: string;
  }) {
    const result = await processEventBatch(
      [
        {
          id: randomUUID(),
          type: eventTypes.SCORE_CREATE,
          timestamp: new Date().toISOString(),
          body: { ...body, id: scoreId },
        },
      ],
      auth,
    );

    return { id: scoreId, result };
  }

  async deleteScore({
    projectId,
    orgId,
    apiKeyId,
    scoreId,
  }: {
    projectId: string;
    orgId: string;
    apiKeyId: string;
    scoreId: string;
  }) {
    const scoreDeleteQueue = ScoreDeleteQueue.getInstance();
    if (!scoreDeleteQueue) {
      throw new InternalServerError("ScoreDeleteQueue not initialized");
    }

    await auditLog({
      action: "delete",
      resourceType: "score",
      resourceId: scoreId,
      projectId,
      orgId,
      apiKeyId,
    });

    await scoreDeleteQueue.add(QueueJobs.ScoreDelete, {
      timestamp: new Date(),
      id: randomUUID(),
      payload: {
        projectId,
        scoreIds: [scoreId],
      },
      name: QueueJobs.ScoreDelete,
    });

    return { message: "Score deletion queued successfully" };
  }

  /**
   * Get a specific score by ID
   * v1: Returns listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION and TEXT
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
        this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined,
      preferredClickhouseService: "ReadOnly",
    });

    if (!score) {
      return undefined;
    }

    return convertScoreToPublicApi(score);
  }

  /**
   * Get list of scores with version-aware filtering
   * v1: Returns listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Returns all score types including CORRECTION and TEXT
   */
  async generateScoresForPublicApi(props: ScoreQueryType) {
    return _handleGenerateScoresForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined,
    });
  }

  /**
   * Get count of scores with version-aware filtering
   * v1: Only counts listable scores (NUMERIC, BOOLEAN, CATEGORICAL, TEXT) - excludes CORRECTION
   * v2: Counts all score types including CORRECTION and TEXT
   */
  async getScoresCountForPublicApi(props: ScoreQueryType) {
    return _handleGetScoresCountForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      scoreDataTypes:
        this.apiVersion === "v1" ? LISTABLE_SCORE_TYPES : undefined,
    });
  }
}
