import { createObservation } from "@/src/__tests__/fixtures/tracing-factory";
import { createObservations } from "@/src/__tests__/server/repositories/clickhouse-helpers";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationV1Response } from "@/src/features/public-api/types/observations";
import { GetScoreResponse } from "@langfuse/shared";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/observations API Endpoint", () => {
  describe("GET /api/public/observations/:id", () => {
    it("should GET an observation", async () => {
      const observationId = v4();
      const traceId = v4();

      const observation = createObservation({
        id: observationId,
        project_id: projectId,
        trace_id: traceId,
      });

      await createObservations([observation]);

      const getEventRes = await makeZodVerifiedAPICall(
        GetObservationV1Response,
        "GET",
        "/api/public/observations/" + observationId,
      );
      expect(getEventRes.body).toMatchObject({
        id: observationId,
        traceId: traceId,
        type: observation.type,
      });
    });
  });
});
