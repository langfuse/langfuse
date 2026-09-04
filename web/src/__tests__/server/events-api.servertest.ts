import { v4 } from "uuid";
import { z } from "zod";
import {
  clickhouseClient,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { PostEventsV1Response } from "@/src/features/public-api/types/events";

type ObservationRow = {
  id: string;
  project_id: string;
  trace_id: string | null;
  name: string | null;
  start_time: string;
  environment: string;
};

const fetchObservation = async (
  projectId: string,
  id: string,
): Promise<ObservationRow | undefined> => {
  const result = await clickhouseClient().query({
    query: `
      SELECT
        id,
        project_id,
        trace_id,
        name,
        start_time,
        environment
      FROM observations
      WHERE project_id = {projectId: String}
        AND id = {id: String}
      LIMIT 1
    `,
    query_params: { projectId, id },
    format: "JSONEachRow",
  });
  const rows = await result.json<ObservationRow>();
  return rows[0];
};

const fetchObservationsByTrace = async (
  projectId: string,
  traceId: string,
): Promise<ObservationRow[]> => {
  const result = await clickhouseClient().query({
    query: `
      SELECT
        id,
        project_id,
        trace_id,
        name,
        start_time,
        environment
      FROM observations
      WHERE project_id = {projectId: String}
        AND trace_id = {traceId: String}
    `,
    query_params: { projectId, traceId },
    format: "JSONEachRow",
  });
  return result.json<ObservationRow>();
};

describe("/api/public/events API Endpoint", () => {
  describe("POST /api/public/events", () => {
    it("should create an event observation and persist it to the legacy observations table", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const observationId = v4();
      const traceId = v4();
      const startTime = new Date("2026-08-31T12:00:00Z").toISOString();

      const response = await makeZodVerifiedAPICall(
        PostEventsV1Response,
        "POST",
        "/api/public/events",
        {
          id: observationId,
          traceId,
          environment: "default",
          name: "test-event",
          startTime,
          level: "DEFAULT",
          metadata: { source: "servertest" },
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(observationId);

      // Allow the ingestion pipeline a moment to flush to ClickHouse.
      await new Promise((r) => setTimeout(r, 1500));

      const stored = await fetchObservation(projectId, observationId);
      expect(stored).toBeDefined();
      expect(stored?.id).toBe(observationId);
      expect(stored?.project_id).toBe(projectId);
      expect(stored?.trace_id).toBe(traceId);
      expect(stored?.name).toBe("test-event");
      expect(stored?.environment).toBe("default");
    });

    it("should generate an id server-side when the request omits one", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const response = await makeZodVerifiedAPICall(
        PostEventsV1Response,
        "POST",
        "/api/public/events",
        {
          environment: "default",
          startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
        },
        auth,
      );

      expect(response.status).toBe(200);
      // The response id is generated server-side when the body omits one.
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(response.body.id.length).toBe(36);
    });

    it("should default traceId to a fresh uuid when the body omits it", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const bodyId = v4();
      const response = await makeZodVerifiedAPICall(
        PostEventsV1Response,
        "POST",
        "/api/public/events",
        {
          id: bodyId,
          environment: "default",
          startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
        },
        auth,
      );

      expect(response.status).toBe(200);

      // Wait for the ingestion pipeline to flush.
      await new Promise((r) => setTimeout(r, 1500));

      // The stored observation should be findable by its own id; if a fresh
      // trace id was created server-side, the row's trace_id column is
      // populated, not null.
      const stored = await fetchObservation(projectId, bodyId);
      expect(stored).toBeDefined();
      expect(stored?.trace_id).toBeTruthy();
    });

    it("should reject requests missing the required environment field", async () => {
      const { auth } = await createOrgProjectAndApiKey();

      const body = z.object({ message: z.string() });
      const response = await makeAPICall<z.infer<typeof body>>(
        "POST",
        "/api/public/events",
        {
          id: v4(),
          startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
        },
        auth,
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it("should reject requests missing the required startTime field", async () => {
      const { auth } = await createOrgProjectAndApiKey();

      const body = z.object({ message: z.string() });
      const response = await makeAPICall<z.infer<typeof body>>(
        "POST",
        "/api/public/events",
        {
          id: v4(),
          environment: "default",
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should persist multiple observations sharing the same traceId", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const traceId = v4();
      const id1 = v4();
      const id2 = v4();

      for (const id of [id1, id2]) {
        const response = await makeZodVerifiedAPICall(
          PostEventsV1Response,
          "POST",
          "/api/public/events",
          {
            id,
            traceId,
            environment: "default",
            startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
          },
          auth,
        );
        expect(response.status).toBe(200);
      }

      // Wait for the ingestion pipeline to flush.
      await new Promise((r) => setTimeout(r, 2000));

      const stored = await fetchObservationsByTrace(projectId, traceId);
      const storedIds = stored.map((row) => row.id).sort();
      expect(storedIds).toEqual([id1, id2].sort());
    });

    it("should reject unauthenticated requests with 401", async () => {
      const response = await makeAPICall("POST", "/api/public/events", {
        id: v4(),
        environment: "default",
        startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
      });

      expect(response.status).toBe(401);
    });
  });

  // Reuse prisma + env import so the test file matches the imports used by
  // sibling servertest files in this directory.
  describe("POST /api/public/events in events_only mode", () => {
    it("should reject with 404 when LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only", async () => {
      const previous = process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
      process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
      try {
        const { auth } = await createOrgProjectAndApiKey();

        const response = await makeAPICall(
          "POST",
          "/api/public/events",
          {
            id: v4(),
            environment: "default",
            startTime: new Date("2026-08-31T12:00:00Z").toISOString(),
          },
          auth,
        );

        // rejectInEventsOnlyMode is a route-level flag on the
        // createAuthedProjectAPIRoute wrapper. It short-circuits with a
        // 404 before the route's fn ever runs.
        expect(response.status).toBe(404);
      } finally {
        if (previous === undefined) {
          delete process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
        } else {
          process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = previous;
        }
      }
    });
  });
});
