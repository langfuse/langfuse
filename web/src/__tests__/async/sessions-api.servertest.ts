import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { createTraces } from "@/src/__tests__/async/repositories/clickhouse-helpers";
import { createTrace } from "@/src/__tests__/fixtures/tracing-factory";
import { GetSessionV1Response } from "@/src/features/public-api/types/sessions";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/sessions API Endpoint", () => {
  describe("GET /api/public/sessions/:sessionId", () => {
    it("should GET a session", async () => {
      const sessionId = v4();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId: projectId,
        },
      });

      const traces = [
        createTrace({ session_id: sessionId, project_id: projectId }),
        createTrace({ session_id: sessionId, project_id: projectId }),
      ];

      await createTraces(traces);

      const getScore = await makeZodVerifiedAPICall(
        GetSessionV1Response,
        "GET",
        `/api/public/sessions/${sessionId}`,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: sessionId,
        projectId,
        createdAt: expect.any(String),
      });

      expect(getScore.body.traces.map((t) => t.id)).toEqual(
        expect.arrayContaining(traces.map((trace) => trace.id)),
      );
    });
  });
});
