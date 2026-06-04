import {
  createTraceScore,
  createSessionScore,
  createDatasetRunScore,
  createScoresCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { GetScoresResponseV3, GetScoreResponseV3 } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { v4 } from "uuid";
import { polymorphicValue } from "@/src/features/public-api/server/scores-api-v3";

const maybe =
  env.LANGFUSE_ENABLE_SCORES_V3_API === "true" ? describe : describe.skip;

describe("/api/public/v3/scores API Endpoint", () => {
  it.skipIf(env.LANGFUSE_ENABLE_SCORES_V3_API === "true")(
    "should return 404 when feature flag is off",
    async () => {
      const project = await createOrgProjectAndApiKey();
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores",
        undefined,
        project.auth,
      );
      expect(res.status).toBe(404);

      const scoreId = v4();
      const res2 = await makeAPICall(
        "GET",
        `/api/public/v3/scores/${scoreId}`,
        undefined,
        project.auth,
      );
      expect(res2.status).toBe(404);
    },
  );

  describe("polymorphicValue unit", () => {
    it("NUMERIC → number", () => {
      expect(polymorphicValue({ dataType: "NUMERIC", value: 0.85 })).toBe(0.85);
    });

    it("BOOLEAN value=1 → true", () => {
      expect(
        polymorphicValue({
          dataType: "BOOLEAN",
          value: 1,
          stringValue: "true",
        }),
      ).toBe(true);
    });

    it("BOOLEAN value=0 → false", () => {
      expect(
        polymorphicValue({
          dataType: "BOOLEAN",
          value: 0,
          stringValue: "false",
        }),
      ).toBe(false);
    });

    it("CATEGORICAL → string", () => {
      expect(
        polymorphicValue({
          dataType: "CATEGORICAL",
          value: 0,
          stringValue: "good",
        }),
      ).toBe("good");
    });

    it("TEXT → string", () => {
      expect(
        polymorphicValue({
          dataType: "TEXT",
          value: 0,
          stringValue: "Great explanation",
        }),
      ).toBe("Great explanation");
    });

    it("CORRECTION → string from longStringValue", () => {
      expect(
        polymorphicValue({
          dataType: "CORRECTION",
          value: 0,
          stringValue: null,
          longStringValue: "corrected output",
        }),
      ).toBe("corrected output");
    });

    it("CATEGORICAL with null stringValue throws", () => {
      expect(() =>
        polymorphicValue({
          dataType: "CATEGORICAL",
          value: 0,
          stringValue: null,
        }),
      ).toThrow();
    });

    it("CORRECTION with null longStringValue throws", () => {
      expect(() =>
        polymorphicValue({
          dataType: "CORRECTION",
          value: 0,
          stringValue: null,
          longStringValue: null,
        }),
      ).toThrow();
    });

    it("unknown dataType throws", () => {
      expect(() => polymorphicValue({ dataType: "WHAT", value: 0 })).toThrow();
    });
  });

  maybe("GET /api/public/v3/scores", () => {
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

    it("limit=101 → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?limit=101",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("NUMERIC score has numeric value", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 0.75,
          data_type: "NUMERIC",
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
      expect(score!.value).toBe(0.75);
      expect(typeof score!.value).toBe("number");
    });

    it("BOOLEAN score has boolean value", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 1,
          string_value: "true",
          data_type: "BOOLEAN",
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
      expect(score!.value).toBe(true);
      expect(typeof score!.value).toBe("boolean");
    });

    it("CATEGORICAL score has string value", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 0,
          string_value: "excellent",
          data_type: "CATEGORICAL",
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
      expect(score!.value).toBe("excellent");
    });

    it("CORRECTION score has string value from longStringValue", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 0,
          long_string_value: "This is the corrected output",
          data_type: "CORRECTION",
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
      expect(score!.value).toBe("This is the corrected output");
    });

    it("TEXT score has string value", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 0,
          string_value: "Very detailed feedback",
          data_type: "TEXT",
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
      expect(score!.value).toBe("Very detailed feedback");
    });

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

  maybe("GET /api/public/v3/scores/:scoreId", () => {
    let auth: string;
    let projectId: string;

    beforeAll(async () => {
      const project = await createOrgProjectAndApiKey();
      auth = project.auth;
      projectId = project.projectId;
    });

    it("returns 200 with a valid scoreId", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          value: 42,
          data_type: "NUMERIC",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoreResponseV3,
        "GET",
        `/api/public/v3/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(scoreId);
      expect(res.body.value).toBe(42);
    });

    it("returns 404 for nonexistent scoreId", async () => {
      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores/${v4()}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 when scoreId belongs to another project", async () => {
      const other = await createOrgProjectAndApiKey();
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({ id: scoreId, project_id: other.projectId }),
      ]);

      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores/${scoreId}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(404);
    });

    it("returns a session score", async () => {
      const scoreId = v4();
      await createScoresCh([
        createSessionScore({ id: scoreId, project_id: projectId, value: 1 }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoreResponseV3,
        "GET",
        `/api/public/v3/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(scoreId);
    });

    it("returns a dataset run score", async () => {
      const scoreId = v4();
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          value: 0.9,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoreResponseV3,
        "GET",
        `/api/public/v3/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(scoreId);
    });
  });
});
