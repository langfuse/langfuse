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
      expect(res.body.data.length).toBe(3);
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
      expect(page1.body.data.length).toBe(2);
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
      expect(page2.body.data.length).toBe(1);
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
});
