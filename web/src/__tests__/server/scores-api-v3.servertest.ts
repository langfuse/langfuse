import {
  createTraceScore,
  createSessionScore,
  createDatasetRunScore,
  createScoresCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { transformBooleanValueForFilter } from "@/src/features/public-api/server/scores-api-v3";
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

    it("limit=101 → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?limit=101",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("limit=0 → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?limit=0",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("limit=-1 → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?limit=-1",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("limit=abc → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?limit=abc",
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

  describe("GET /api/public/v3/scores — cursor pagination", () => {
    let auth: string;
    let projectId: string;

    beforeAll(async () => {
      const project = await createOrgProjectAndApiKey();
      auth = project.auth;
      projectId = project.projectId;
    });

    it("returns cursor when more pages exist and no cursor on last page", async () => {
      const scores = Array.from({ length: 3 }, () =>
        createTraceScore({ project_id: projectId }),
      );
      await createScoresCh(scores);

      // page 1: limit=2, expect cursor
      const page1 = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?limit=2",
        undefined,
        auth,
      );
      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBeGreaterThanOrEqual(2);
      expect(page1.body.meta.limit).toBe(2);
      expect(page1.body.meta.cursor).toBeDefined();

      // page 2: use cursor, should return remaining and no cursor
      const page2 = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?limit=2&cursor=${page1.body.meta.cursor}`,
        undefined,
        auth,
      );
      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBeGreaterThanOrEqual(1);
      expect(page2.body.meta.cursor).toBeUndefined();
    });

    it("paginates without duplicates or skips", async () => {
      const project = await createOrgProjectAndApiKey();
      const count = 7;
      const scores = Array.from({ length: count }, () =>
        createTraceScore({ project_id: project.projectId }),
      );
      await createScoresCh(scores);
      const scoreIds = new Set(scores.map((s) => s.id));

      const seenIds = new Set<string>();
      let cursor: string | undefined;

      do {
        const url = cursor
          ? `/api/public/v3/scores?limit=3&cursor=${cursor}`
          : "/api/public/v3/scores?limit=3";
        const res = await makeZodVerifiedAPICall(
          GetScoresResponseV3,
          "GET",
          url,
          undefined,
          project.auth,
        );
        expect(res.status).toBe(200);
        for (const s of res.body.data) {
          expect(seenIds.has(s.id)).toBe(false);
          seenIds.add(s.id);
        }
        cursor = res.body.meta.cursor;
      } while (cursor);

      // all inserted scores must appear exactly once
      for (const id of scoreIds) {
        expect(seenIds.has(id)).toBe(true);
      }
    });

    it("invalid cursor → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?cursor=not-valid-base64!!",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("valid base64url but wrong JSON shape cursor → 400", async () => {
      const badShapeCursor = Buffer.from(
        JSON.stringify({ foo: "bar" }),
      ).toString("base64url");
      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores?cursor=${badShapeCursor}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("stale cursor (no matching rows) returns empty page with no cursor", async () => {
      const staleCursor = Buffer.from(
        JSON.stringify({
          lastTimestamp: new Date(0).toISOString(),
          lastId: "00000000-0000-0000-0000-000000000000",
        }),
      ).toString("base64url");

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?cursor=${staleCursor}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
      expect(res.body.meta.cursor).toBeUndefined();
    });

    it("cross-tenant cursor replay returns empty page for project B", async () => {
      const projectA = await createOrgProjectAndApiKey();
      const scoresA = Array.from({ length: 3 }, () =>
        createTraceScore({ project_id: projectA.projectId }),
      );
      await createScoresCh(scoresA);

      const page1A = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?limit=2",
        undefined,
        projectA.auth,
      );
      expect(page1A.body.meta.cursor).toBeDefined();
      const cursorFromA = page1A.body.meta.cursor!;

      const projectB = await createOrgProjectAndApiKey();
      const scoresB = Array.from({ length: 3 }, () =>
        createTraceScore({ project_id: projectB.projectId }),
      );
      await createScoresCh(scoresB);

      const replayRes = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?limit=2&cursor=${cursorFromA}`,
        undefined,
        projectB.auth,
      );
      expect(replayRes.status).toBe(200);
      const leakedIds = new Set(scoresA.map((s) => s.id));
      for (const s of replayRes.body.data) {
        expect(leakedIds.has(s.id)).toBe(false);
      }
    });

    it("exact-page-boundary: N rows with limit=N returns no cursor", async () => {
      const project = await createOrgProjectAndApiKey();
      const n = 3;
      const scores = Array.from({ length: n }, () =>
        createTraceScore({ project_id: project.projectId }),
      );
      await createScoresCh(scores);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?limit=${n}`,
        undefined,
        project.auth,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(n);
      expect(res.body.meta.cursor).toBeUndefined();
    });

    it("paginates with fields=details preserved across pages", async () => {
      const project = await createOrgProjectAndApiKey();
      const count = 3;
      const scores = Array.from({ length: count }, (_, i) =>
        createTraceScore({
          project_id: project.projectId,
          comment: `c${i}`,
          metadata: { idx: String(i) },
        }),
      );
      await createScoresCh(scores);

      const seenIds = new Set<string>();
      let cursor: string | undefined;

      do {
        const url = cursor
          ? `/api/public/v3/scores?limit=2&fields=core,details&cursor=${cursor}`
          : "/api/public/v3/scores?limit=2&fields=core,details";
        const res = await makeZodVerifiedAPICall(
          GetScoresResponseV3,
          "GET",
          url,
          undefined,
          project.auth,
        );
        expect(res.status).toBe(200);
        for (const s of res.body.data) {
          expect(seenIds.has(s.id)).toBe(false);
          seenIds.add(s.id);
          expect(s.details).toBeDefined();
          expect(s.details!.comment).toMatch(/^c\d$/);
        }
        cursor = res.body.meta.cursor;
      } while (cursor);

      expect(seenIds.size).toBe(count);
    });

    it("limit=1 paginates one score at a time", async () => {
      const project = await createOrgProjectAndApiKey();
      const scores = Array.from({ length: 3 }, () =>
        createTraceScore({ project_id: project.projectId }),
      );
      await createScoresCh(scores);
      const scoreIds = new Set(scores.map((s) => s.id));

      const seenIds = new Set<string>();
      let cursor: string | undefined;

      do {
        const url = cursor
          ? `/api/public/v3/scores?limit=1&cursor=${cursor}`
          : "/api/public/v3/scores?limit=1";
        const res = await makeZodVerifiedAPICall(
          GetScoresResponseV3,
          "GET",
          url,
          undefined,
          project.auth,
        );
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        const id = res.body.data[0].id;
        expect(seenIds.has(id)).toBe(false);
        seenIds.add(id);
        cursor = res.body.meta.cursor;
      } while (cursor);

      for (const id of scoreIds) {
        expect(seenIds.has(id)).toBe(true);
      }
    });
  });

  describe("GET /api/public/v3/scores — field groups", () => {
    let auth: string;
    let projectId: string;

    beforeAll(async () => {
      const project = await createOrgProjectAndApiKey();
      auth = project.auth;
      projectId = project.projectId;
    });

    it("fields omitted → only core keys present", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          comment: "some comment",
          config_id: "cfg-1",
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
      expect(score).not.toHaveProperty("details");
      expect(score).not.toHaveProperty("subject");
      expect(score).not.toHaveProperty("annotation");
    });

    it("fields=core,details → details present", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          comment: "test comment",
          config_id: "cfg-abc",
          metadata: { key: "val" },
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,details",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.details).toBeDefined();
      expect(score!.details!.comment).toBe("test comment");
      expect(score!.details!.configId).toBe("cfg-abc");
      expect(score!.details!.metadata).toEqual({ key: "val" });
      expect(score).not.toHaveProperty("subject");
      expect(score).not.toHaveProperty("annotation");
    });

    it("fields=core,annotation → annotation present", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          author_user_id: "user-xyz",
          queue_id: "queue-abc",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,annotation",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.annotation).toBeDefined();
      expect(score!.annotation!.authorUserId).toBe("user-xyz");
      expect(score!.annotation!.queueId).toBe("queue-abc");
      expect(score).not.toHaveProperty("details");
      expect(score).not.toHaveProperty("subject");
    });

    it("fields=core,annotation on a non-annotation source yields null fields", async () => {
      const scoreId = v4();
      // createTraceScore defaults source to "API"; author_user_id and queue_id
      // are left at their column defaults so the annotation group should be
      // present but with null fields (matching the Fern doc contract).
      await createScoresCh([
        createTraceScore({ id: scoreId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,annotation",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.annotation).toBeDefined();
      expect(score!.annotation!.authorUserId).toBeNull();
      expect(score!.annotation!.queueId).toBeNull();
    });

    it("fields=core,subject → trace score has kind=trace", async () => {
      const scoreId = v4();
      const traceId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,subject",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.subject).toBeDefined();
      expect(score!.subject!.kind).toBe("trace");
      expect(score!.subject!.id).toBe(traceId);
      expect(score!.subject).not.toHaveProperty("traceId");
    });

    it("fields=core,subject → session score has kind=session", async () => {
      const scoreId = v4();
      const sessionId = v4();
      await createScoresCh([
        createSessionScore({
          id: scoreId,
          project_id: projectId,
          session_id: sessionId,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,subject",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.subject!.kind).toBe("session");
      expect(score!.subject!.id).toBe(sessionId);
    });

    it("fields=core,subject → dataset run score has kind=experiment", async () => {
      const scoreId = v4();
      const datasetRunId = v4();
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: datasetRunId,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,subject",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.subject!.kind).toBe("experiment");
      expect(score!.subject!.id).toBe(datasetRunId);
    });

    it("fields=core,subject → observation score has kind=observation with traceId", async () => {
      const scoreId = v4();
      const observationId = v4();
      const traceId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          observation_id: observationId,
          trace_id: traceId,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?fields=core,subject",
        undefined,
        auth,
      );

      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score!.subject!.kind).toBe("observation");
      expect(score!.subject!.id).toBe(observationId);
      expect(score!.subject).toHaveProperty("traceId", traceId);
    });

    it("fields=core,unknown → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?fields=core,unknown",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("fields=trace → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?fields=trace",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("fields=core passed explicitly behaves same as omitted", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({ id: scoreId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?fields=core`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score).not.toHaveProperty("details");
      expect(score).not.toHaveProperty("subject");
      expect(score).not.toHaveProperty("annotation");
    });

    it("fields=core,details,subject,annotation → all groups present simultaneously", async () => {
      const scoreId = v4();
      const traceId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          source: "ANNOTATION",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?fields=core,details,subject,annotation`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score).toBeDefined();
      expect(score).toHaveProperty("details");
      expect(score).toHaveProperty("subject");
      expect(score).toHaveProperty("annotation");
      expect(score!.subject!.kind).toBe("trace");
      expect(score!.subject!.id).toBe(traceId);
    });
  });

  describe("transformBooleanValueForFilter unit", () => {
    it('"true" → 1', () => {
      expect(transformBooleanValueForFilter("true")).toBe(1);
    });
    it('"false" → 0', () => {
      expect(transformBooleanValueForFilter("false")).toBe(0);
    });
  });

  describe("GET /api/public/v3/scores — filter params", () => {
    let auth: string;
    let projectId: string;

    beforeAll(async () => {
      const project = await createOrgProjectAndApiKey();
      auth = project.auth;
      projectId = project.projectId;
    });

    // --- Validation (400) tests ---

    it("userId → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?userId=u1",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("traceTags → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?traceTags=tag1",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value= without dataType → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=0.5",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value= with multi-value dataType → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=0.5&dataType=NUMERIC,BOOLEAN",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value= with dataType=TEXT → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=foo&dataType=TEXT",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value=1 with dataType=BOOLEAN → 400 (must be true/false)", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=1&dataType=BOOLEAN",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("valueMin= with dataType=CATEGORICAL → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?valueMin=0.2&dataType=CATEGORICAL",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("valueMin= without dataType → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?valueMin=0.2",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("two exclusive parent-entity params → 400", async () => {
      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores?traceId=${v4()}&sessionId=${v4()}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("observationId without traceId → 400", async () => {
      const res = await makeAPICall(
        "GET",
        `/api/public/v3/scores?observationId=${v4()}`,
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    // --- Filter correctness tests ---

    it("id filter (single) returns only matching score", async () => {
      const scoreId = v4();
      const otherId = v4();
      await createScoresCh([
        createTraceScore({ id: scoreId, project_id: projectId }),
        createTraceScore({ id: otherId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?id=${scoreId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("id filter (comma-separated) returns both matching scores", async () => {
      const id1 = v4();
      const id2 = v4();
      const id3 = v4();
      await createScoresCh([
        createTraceScore({ id: id1, project_id: projectId }),
        createTraceScore({ id: id2, project_id: projectId }),
        createTraceScore({ id: id3, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?id=${id1},${id2}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).not.toContain(id3);
    });

    it("name filter returns only scores with matching name", async () => {
      const scoreName = `filter-test-name-${v4()}`;
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          name: scoreName,
        }),
        createTraceScore({ project_id: projectId, name: "other-name" }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?name=${encodeURIComponent(scoreName)}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.every((s) => s.name === scoreName)).toBe(true);
      expect(res.body.data.some((s) => s.id === scoreId)).toBe(true);
    });

    it("source filter returns only scores with matching source", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          source: "ANNOTATION",
        }),
        createTraceScore({ project_id: projectId, source: "API" }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?source=ANNOTATION",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.every((s) => s.source === "ANNOTATION")).toBe(true);
      expect(res.body.data.some((s) => s.id === scoreId)).toBe(true);
    });

    it("dataType filter returns only scores of that type", async () => {
      const numericId = v4();
      const boolId = v4();
      await createScoresCh([
        createTraceScore({
          id: numericId,
          project_id: projectId,
          data_type: "NUMERIC",
          value: 0.5,
        }),
        createTraceScore({
          id: boolId,
          project_id: projectId,
          data_type: "BOOLEAN",
          value: 1,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?dataType=NUMERIC",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.every((s) => s.dataType === "NUMERIC")).toBe(true);
      expect(res.body.data.some((s) => s.id === numericId)).toBe(true);
    });

    it("traceId filter returns only scores for that trace", async () => {
      const traceId = v4();
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
        }),
        createTraceScore({ project_id: projectId, trace_id: v4() }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?traceId=${traceId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("observationId + traceId filter returns only the matching observation-level score", async () => {
      const traceId = v4();
      const observationId = v4();
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: observationId,
        }),
        createTraceScore({ project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?traceId=${traceId}&observationId=${observationId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("traceId + observationId scopes to the correct trace (cross-trace isolation)", async () => {
      const traceId = v4();
      const observationId = v4();
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: observationId,
        }),
        // same observationId but on a different trace — must not appear
        createTraceScore({
          project_id: projectId,
          trace_id: v4(),
          observation_id: observationId,
        }),
        createTraceScore({ project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?traceId=${traceId}&observationId=${observationId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("sessionId filter returns only session scores", async () => {
      const sessionId = v4();
      const scoreId = v4();
      await createScoresCh([
        createSessionScore({
          id: scoreId,
          project_id: projectId,
          session_id: sessionId,
        }),
        createTraceScore({ project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?sessionId=${sessionId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("experimentId filter returns only dataset run scores", async () => {
      const datasetRunId = v4();
      const scoreId = v4();
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: datasetRunId,
        }),
        createTraceScore({ project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?experimentId=${datasetRunId}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toEqual([scoreId]);
    });

    it("value=0.85 dataType=NUMERIC matches numeric column", async () => {
      const scoreId = v4();
      const otherId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          data_type: "NUMERIC",
          value: 0.85,
        }),
        createTraceScore({
          id: otherId,
          project_id: projectId,
          data_type: "NUMERIC",
          value: 0.5,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?value=0.85&dataType=NUMERIC",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.map((s) => s.id)).toContain(scoreId);
      expect(res.body.data.map((s) => s.id)).not.toContain(otherId);
    });

    it("value=good,bad dataType=CATEGORICAL matches string_value", async () => {
      const goodId = v4();
      const badId = v4();
      const otherId = v4();
      await createScoresCh([
        createTraceScore({
          id: goodId,
          project_id: projectId,
          data_type: "CATEGORICAL",
          value: 0,
          string_value: "good",
        }),
        createTraceScore({
          id: badId,
          project_id: projectId,
          data_type: "CATEGORICAL",
          value: 0,
          string_value: "bad",
        }),
        createTraceScore({
          id: otherId,
          project_id: projectId,
          data_type: "CATEGORICAL",
          value: 0,
          string_value: "neutral",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?value=good,bad&dataType=CATEGORICAL",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(goodId);
      expect(ids).toContain(badId);
      expect(ids).not.toContain(otherId);
    });

    it("value=true dataType=BOOLEAN matches numeric column = 1", async () => {
      const trueId = v4();
      const falseId = v4();
      await createScoresCh([
        createTraceScore({
          id: trueId,
          project_id: projectId,
          data_type: "BOOLEAN",
          value: 1,
          string_value: "true",
        }),
        createTraceScore({
          id: falseId,
          project_id: projectId,
          data_type: "BOOLEAN",
          value: 0,
          string_value: "false",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?value=true&dataType=BOOLEAN",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(trueId);
      expect(ids).not.toContain(falseId);
    });

    it("value=true,false dataType=BOOLEAN → 200, returns all boolean scores", async () => {
      const trueId = v4();
      const falseId = v4();
      await createScoresCh([
        createTraceScore({
          id: trueId,
          project_id: projectId,
          data_type: "BOOLEAN",
          value: 1,
          string_value: "true",
        }),
        createTraceScore({
          id: falseId,
          project_id: projectId,
          data_type: "BOOLEAN",
          value: 0,
          string_value: "false",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?value=true,false&dataType=BOOLEAN",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(trueId);
      expect(ids).toContain(falseId);
    });

    it("valueMin/valueMax filter matches only scores in range", async () => {
      const inRangeId = v4();
      const outOfRangeId = v4();
      await createScoresCh([
        createTraceScore({
          id: inRangeId,
          project_id: projectId,
          data_type: "NUMERIC",
          value: 0.7,
        }),
        createTraceScore({
          id: outOfRangeId,
          project_id: projectId,
          data_type: "NUMERIC",
          value: 0.2,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?valueMin=0.5&valueMax=1.0&dataType=NUMERIC",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(inRangeId);
      expect(ids).not.toContain(outOfRangeId);
    });

    it("fromTimestamp omitted with no entity filter → 200", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores",
        undefined,
        auth,
      );
      expect(res.status).toBe(200);
    });

    it("source=INVALID → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?source=BOGUS",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("dataType=INVALID → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?dataType=NUMRIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value=notanumber&dataType=NUMERIC → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=notanumber&dataType=NUMERIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value=Infinity&dataType=NUMERIC → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=Infinity&dataType=NUMERIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("valueMin=Infinity&dataType=NUMERIC → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?valueMin=Infinity&dataType=NUMERIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("valueMax=-Infinity&dataType=NUMERIC → 400", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?valueMax=-Infinity&dataType=NUMERIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(400);
    });

    it("value= (empty) with dataType=NUMERIC → 200 (not treated as present)", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?value=&dataType=NUMERIC",
        undefined,
        auth,
      );
      expect(res.status).toBe(200);
    });

    it("valueMin= (empty) with dataType=NUMERIC → 200, does not narrow to value>=0", async () => {
      // Regression: z.coerce.number() coerces "" to 0, which would emit
      // `s.value >= 0` and silently drop negative-valued scores.
      const project = await createOrgProjectAndApiKey();
      const negativeId = v4();
      const positiveId = v4();
      await createScoresCh([
        createTraceScore({
          id: negativeId,
          project_id: project.projectId,
          data_type: "NUMERIC",
          value: -1.5,
        }),
        createTraceScore({
          id: positiveId,
          project_id: project.projectId,
          data_type: "NUMERIC",
          value: 0.5,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?valueMin=&dataType=NUMERIC",
        undefined,
        project.auth,
      );
      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(negativeId);
      expect(ids).toContain(positiveId);
    });

    it("valueMax= (empty) with dataType=NUMERIC → 200, does not narrow to value<=0", async () => {
      const project = await createOrgProjectAndApiKey();
      const negativeId = v4();
      const positiveId = v4();
      await createScoresCh([
        createTraceScore({
          id: negativeId,
          project_id: project.projectId,
          data_type: "NUMERIC",
          value: -1.5,
        }),
        createTraceScore({
          id: positiveId,
          project_id: project.projectId,
          data_type: "NUMERIC",
          value: 0.5,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?valueMax=&dataType=NUMERIC",
        undefined,
        project.auth,
      );
      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(negativeId);
      expect(ids).toContain(positiveId);
    });

    it("environment filter returns only scores with matching environment", async () => {
      const scoreId = v4();
      const controlId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          environment: "staging",
        }),
        createTraceScore({
          id: controlId,
          project_id: projectId,
          environment: "production",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?environment=staging`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(
        res.body.data.length > 0 &&
          res.body.data.every((s) => s.environment === "staging"),
      ).toBe(true);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(scoreId);
      expect(ids).not.toContain(controlId);
    });

    it("configId filter returns only scores with matching configId", async () => {
      const scoreId = v4();
      const controlId = v4();
      const configId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          config_id: configId,
        }),
        createTraceScore({ id: controlId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?configId=${configId}&fields=core,details`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(
        res.body.data.length > 0 &&
          res.body.data.every((s) => s.details?.configId === configId),
      ).toBe(true);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(scoreId);
      expect(ids).not.toContain(controlId);
    });

    it("queueId filter returns only scores with matching queueId", async () => {
      const scoreId = v4();
      const controlId = v4();
      const queueId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          queue_id: queueId,
        }),
        createTraceScore({ id: controlId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?queueId=${queueId}&fields=core,annotation`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(
        res.body.data.length > 0 &&
          res.body.data.every((s) => s.annotation?.queueId === queueId),
      ).toBe(true);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(scoreId);
      expect(ids).not.toContain(controlId);
    });

    it("authorUserId filter returns only scores with matching authorUserId", async () => {
      const scoreId = v4();
      const controlId = v4();
      const userId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          author_user_id: userId,
        }),
        createTraceScore({ id: controlId, project_id: projectId }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?authorUserId=${userId}&fields=core,annotation`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(
        res.body.data.length > 0 &&
          res.body.data.every((s) => s.annotation?.authorUserId === userId),
      ).toBe(true);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(scoreId);
      expect(ids).not.toContain(controlId);
    });

    it("toTimestamp excludes scores after the cutoff", async () => {
      const oldId = v4();
      const newId = v4();
      const cutoff = new Date("2025-01-01T00:00:00Z");
      await createScoresCh([
        createTraceScore({
          id: oldId,
          project_id: projectId,
          timestamp: new Date("2024-06-01T00:00:00Z").getTime(),
        }),
        createTraceScore({
          id: newId,
          project_id: projectId,
          timestamp: new Date("2025-06-01T00:00:00Z").getTime(),
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        `/api/public/v3/scores?fromTimestamp=2020-01-01&toTimestamp=${cutoff.toISOString()}`,
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.some((s) => s.id === oldId)).toBe(true);
      expect(res.body.data.some((s) => s.id === newId)).toBe(false);
    });

    it("combines multiple filters with AND semantics", async () => {
      // Three scores: each matches one filter dimension, only one matches all
      // three. The AND-stacking in buildDynamicFilters' .join(" AND ") must
      // return exactly the all-three-match row.
      const matchId = v4();
      const onlyNameId = v4();
      const onlySourceId = v4();
      const onlyDataTypeId = v4();
      const sharedTs = new Date("2025-04-01T00:00:00Z").getTime();
      await createScoresCh([
        createTraceScore({
          id: matchId,
          project_id: projectId,
          name: "combo-name",
          source: "ANNOTATION",
          data_type: "CATEGORICAL",
          string_value: "x",
          value: 0,
          timestamp: sharedTs,
        }),
        createTraceScore({
          id: onlyNameId,
          project_id: projectId,
          name: "combo-name",
          source: "API",
          data_type: "NUMERIC",
          timestamp: sharedTs,
        }),
        createTraceScore({
          id: onlySourceId,
          project_id: projectId,
          name: "other-name",
          source: "ANNOTATION",
          data_type: "NUMERIC",
          timestamp: sharedTs,
        }),
        createTraceScore({
          id: onlyDataTypeId,
          project_id: projectId,
          name: "other-name",
          source: "API",
          data_type: "CATEGORICAL",
          string_value: "x",
          value: 0,
          timestamp: sharedTs,
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?name=combo-name&source=ANNOTATION&dataType=CATEGORICAL",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      const ids = res.body.data.map((s) => s.id);
      expect(ids).toContain(matchId);
      expect(ids).not.toContain(onlyNameId);
      expect(ids).not.toContain(onlySourceId);
      expect(ids).not.toContain(onlyDataTypeId);
    });

    it("empty fromTimestamp/toTimestamp query params are treated as absent → 200", async () => {
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?fromTimestamp=&toTimestamp=",
        undefined,
        auth,
      );
      expect(res.status).toBe(200);
    });

    it("empty userId/traceTags query params do not trigger the use-v2 400", async () => {
      // ?userId= (empty) and ?traceTags= should be treated as absent rather
      // than tripping the trace-JOIN-not-supported error.
      const res = await makeAPICall(
        "GET",
        "/api/public/v3/scores?userId=&traceTags=",
        undefined,
        auth,
      );
      expect(res.status).toBe(200);
    });

    it("regression: limit and fields still work alongside filters", async () => {
      const scoreId = v4();
      await createScoresCh([
        createTraceScore({
          id: scoreId,
          project_id: projectId,
          comment: "regression-check",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV3,
        "GET",
        "/api/public/v3/scores?limit=10&fields=core,details",
        undefined,
        auth,
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(10);
      const score = res.body.data.find((s) => s.id === scoreId);
      expect(score?.details?.comment).toBe("regression-check");
    });
  });
});
