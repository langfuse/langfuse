import {
  createTraceScore,
  createScoresCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { GetScoresResponseV3 } from "@langfuse/shared";
import { v4 } from "uuid";

describe("/api/public/v3/scores API Endpoint", () => {
  describe("GET /api/public/v3/scores", () => {
    let auth: string;
    let projectId: string;

    beforeAll(async () => {
      const project = await createOrgProjectAndApiKey();
      auth = project.auth;
      projectId = project.projectId;
    });

    it("returns scores with default limit=50 and meta", async () => {
      const scores = Array.from({ length: 3 }, () =>
        createTraceScore({ project_id: projectId }),
      );
      await createScoresCh(scores);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ limit: 50 });
      expect(res.body.meta).not.toHaveProperty("cursor");
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("respects limit param", async () => {
      const scores = Array.from({ length: 5 }, () =>
        createTraceScore({ project_id: projectId }),
      );
      await createScoresCh(scores);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?limit=2",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it.each([101, 0, -1, "abc"])("limit=%s → 400", async (limit) => {
      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores?limit=${limit}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it.each([
      ["NUMERIC", { value: 0.75, data_type: "NUMERIC" as const }, 0.75],
      [
        "BOOLEAN",
        { value: 1, string_value: "true", data_type: "BOOLEAN" as const },
        true,
      ],
      [
        "CATEGORICAL",
        {
          value: 0,
          string_value: "excellent",
          data_type: "CATEGORICAL" as const,
        },
        "excellent",
      ],
      [
        "TEXT",
        {
          value: 0,
          string_value: "Very detailed feedback",
          data_type: "TEXT" as const,
        },
        "Very detailed feedback",
      ],
      [
        "CORRECTION",
        {
          value: 0,
          long_string_value: "This is the corrected output",
          data_type: "CORRECTION" as const,
        },
        "This is the corrected output",
      ],
    ])(
      "%s score has correct polymorphic value",
      async (_dataType, scoreFields, expected) => {
        const scoreId = v4();
        await createScoresCh([
          createTraceScore({
            id: scoreId,
            project_id: projectId,
            ...scoreFields,
          }),
        ]);

        const res = await makeZodVerifiedAPICall(
          GetScoresResponseV3,
          "GET",
          "/api/public/v3/scores",
          undefined,
          auth,
        );

        const score = res.body.data.find((s) => s.id === scoreId);
        expect(score).toBeDefined();
        expect(score!.value).toBe(expected);
      },
    );

    it("tenant isolation: project A cannot see project B scores", async () => {
      const projectB = await createOrgProjectAndApiKey();
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({ id: scoreId, project_id: projectB.projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores",
        undefined,
        auth,
      );

      const leaked = res.body.data.find((s) => s.id === scoreId);
      expect(leaked).toBeUndefined();
    });
  });
});
