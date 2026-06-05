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
import { GetScoresResponseV3 } from "@langfuse/shared";
import { v4 } from "uuid";
import { buildSelectColumns } from "@/src/features/public-api/server/scores-api-v3";

describe("/api/public/v3/scores API Endpoint", () => {
  describe("buildSelectColumns unit", () => {
    // These tests lock the SELECT-vs-converter contract: domainToV3 reads
    // these column groups from the ClickHouse row, so an addition here that
    // is not also reflected in the corresponding fields-group response builder
    // (or vice versa) will be caught at this layer.

    it("core always selects the polymorphic value columns", () => {
      const sql = buildSelectColumns(["core"]);
      expect(sql).toContain("s.value as value");
      expect(sql).toContain("s.string_value as string_value");
      expect(sql).toContain("s.long_string_value as long_string_value");
      expect(sql).toContain("s.data_type as data_type");
    });

    it("core does not select group columns", () => {
      const sql = buildSelectColumns(["core"]);
      expect(sql).not.toContain("s.comment");
      expect(sql).not.toContain("s.metadata");
      expect(sql).not.toContain("s.config_id");
      expect(sql).not.toContain("s.trace_id");
      expect(sql).not.toContain("s.observation_id");
      expect(sql).not.toContain("s.session_id");
      expect(sql).not.toContain("s.dataset_run_id");
      expect(sql).not.toContain("s.author_user_id");
      expect(sql).not.toContain("s.queue_id");
    });

    it("details adds comment/metadata/config_id only", () => {
      const sql = buildSelectColumns(["core", "details"]);
      expect(sql).toContain("s.comment as comment");
      expect(sql).toContain("s.metadata as metadata");
      expect(sql).toContain("s.config_id as config_id");
      expect(sql).not.toContain("s.trace_id");
      expect(sql).not.toContain("s.author_user_id");
    });

    it("subject adds the four entity-id columns only", () => {
      const sql = buildSelectColumns(["core", "subject"]);
      expect(sql).toContain("s.trace_id as trace_id");
      expect(sql).toContain("s.observation_id as observation_id");
      expect(sql).toContain("s.session_id as session_id");
      expect(sql).toContain("s.dataset_run_id as dataset_run_id");
      expect(sql).not.toContain("s.comment");
      expect(sql).not.toContain("s.author_user_id");
    });

    it("annotation adds author/queue only", () => {
      const sql = buildSelectColumns(["core", "annotation"]);
      expect(sql).toContain("s.author_user_id as author_user_id");
      expect(sql).toContain("s.queue_id as queue_id");
      expect(sql).not.toContain("s.comment");
      expect(sql).not.toContain("s.trace_id");
    });

    it("all groups select every column", () => {
      const sql = buildSelectColumns([
        "core",
        "details",
        "subject",
        "annotation",
      ]);
      for (const col of [
        "s.comment",
        "s.metadata",
        "s.config_id",
        "s.trace_id",
        "s.observation_id",
        "s.session_id",
        "s.dataset_run_id",
        "s.author_user_id",
        "s.queue_id",
      ]) {
        expect(sql).toContain(col);
      }
    });
  });

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
          metadata: { idx: i },
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
      expect(score!.subject!.traceId).toBe(traceId);
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
});
