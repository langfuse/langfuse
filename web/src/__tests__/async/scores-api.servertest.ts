import { createScores } from "@/src/__tests__/server/repositories/clickhouse-helpers";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetScoreResponse } from "@langfuse/shared";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/scores API Endpoint", () => {
  describe("GET /api/public/scores/:scoreId", () => {
    it("should GET a score", async () => {
      const scoreId = v4();
      const traceId = v4();
      const score = {
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "Test Score",
        timestamp: Date.now(),
        observation_id: v4(),
        value: 100.5,
        source: "API",
        comment: "comment",
        data_type: "NUMERIC" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      };

      await createScores([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponse,
        "GET",
        `/api/public/scores/${scoreId}`,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Test Score",
        value: 100.5,
        comment: "comment",
        source: "API",
        traceId,
        observationId: score.observation_id,
        dataType: "NUMERIC",
      });
    });
  });
});
