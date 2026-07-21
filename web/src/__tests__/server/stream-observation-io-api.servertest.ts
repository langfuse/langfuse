/** @vitest-environment node */
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";
import { createMocks } from "node-mocks-http";
import { LangfuseNotFoundError, UnauthorizedError } from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../pages/api/traces/[traceId]/observations/[observationId]/io/[field]";

const {
  mockGetServerAuthSession,
  mockGetAuthorizedTrace,
  mockStreamIOField,
  mockByteLength,
} = vi.hoisted(() => ({
  mockGetServerAuthSession: vi.fn(),
  mockGetAuthorizedTrace: vi.fn(),
  mockStreamIOField: vi.fn(),
  mockByteLength: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  getServerAuthSession: (...args: unknown[]) =>
    mockGetServerAuthSession(...args),
}));

// Override only the trace authorizer; keep the rest of the module real.
vi.mock("../../features/traces/server/buildTraceExport", async () => ({
  ...(await vi.importActual("../../features/traces/server/buildTraceExport")),
  getAuthorizedTrace: (...args: unknown[]) => mockGetAuthorizedTrace(...args),
}));

// Override only the ClickHouse streaming read; keep logger, the field enum, and
// everything withMiddlewares needs from the barrel intact.
vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  getObservationIOFieldByteLengthFromEventsTable: (...args: unknown[]) =>
    mockByteLength(...args),
  streamObservationIOFieldFromEventsTable: (...args: unknown[]) =>
    mockStreamIOField(...args),
}));

const projectId = "project-1";
const traceId = "trace-1";
const observationId = "obs-1";
const startTime = "2024-06-15T12:00:00.000Z";

const createGetMocks = (query: Record<string, string | string[] | undefined>) =>
  createMocks<NextApiRequest, NextApiResponse>({ method: "GET", query });

const validQuery = {
  traceId,
  observationId,
  field: "input",
  projectId,
  startTime,
};

describe("GET /api/traces/[traceId]/observations/[observationId]/io/[field]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerAuthSession.mockResolvedValue({
      user: {
        email: "test@example.com",
        admin: false,
        organizations: [{ projects: [{ id: projectId }] }],
      },
    });
    mockGetAuthorizedTrace.mockResolvedValue({
      id: traceId,
      timestamp: new Date(startTime),
    });
    // Byte length matches the streamed body ('{"hello":"world"}' = 17 bytes).
    mockByteLength.mockResolvedValue(17);
    mockStreamIOField.mockResolvedValue({
      stream: Readable.from(['{"hello":', '"world"}']),
    });
  });

  it("streams the field as opaque bytes with a Content-Length for an authorized member", async () => {
    const { req, res } = createGetMocks(validQuery);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    // Opaque bytes, not application/json (input/output may be a bare string).
    expect(res.getHeader("Content-Type")).toBe("application/octet-stream");
    // Exact byte count → the client can detect a truncated body.
    expect(res.getHeader("Content-Length")).toBe("17");
    expect(res.getHeader("Cache-Control")).toBe("private, no-store");
    expect(res.getHeader("Accept-Ranges")).toBe("none");
    expect(res._getData()).toBe('{"hello":"world"}');

    // The ClickHouse read is pinned to exactly this tenant/trace/observation.
    expect(mockStreamIOField).toHaveBeenCalledWith({
      projectId,
      traceId,
      observationId,
      field: "input",
      startTime: new Date(startTime),
    });
  });

  it("returns 404 (not a misleading empty 200) when the field/observation is not found", async () => {
    // No matching row (e.g. a stale/skewed startTime) → the length pre-query
    // returns null → clean 404, and the stream is never opened.
    mockByteLength.mockResolvedValue(null);
    const { req, res } = createGetMocks(validQuery);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(mockStreamIOField).not.toHaveBeenCalled();
  });

  it("serves a genuinely empty field as 200 with Content-Length 0", async () => {
    mockByteLength.mockResolvedValue(0);
    mockStreamIOField.mockResolvedValue({ stream: Readable.from([]) });
    const { req, res } = createGetMocks(validQuery);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Length")).toBe("0");
    expect(res._getData()).toBe("");
  });

  it("serves each supported field", async () => {
    for (const field of ["input", "output", "metadata"] as const) {
      vi.clearAllMocks();
      mockGetServerAuthSession.mockResolvedValue({
        user: {
          email: "test@example.com",
          admin: false,
          organizations: [{ projects: [{ id: projectId }] }],
        },
      });
      mockGetAuthorizedTrace.mockResolvedValue({ id: traceId });
      mockByteLength.mockResolvedValue(1);
      mockStreamIOField.mockResolvedValue({ stream: Readable.from(["x"]) });

      const { req, res } = createGetMocks({ ...validQuery, field });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockStreamIOField).toHaveBeenCalledWith(
        expect.objectContaining({ field }),
      );
    }
  });

  it("returns 401 and never reads IO when the caller is not authorized (cross-project/tenant)", async () => {
    // A user from another project: getAuthorizedTrace rejects for a
    // non-public trace they cannot access.
    mockGetAuthorizedTrace.mockRejectedValue(
      new UnauthorizedError(
        "User is not a member of this project and this trace is not public",
      ),
    );
    const { req, res } = createGetMocks(validQuery);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    // Authorization gates data access: the ClickHouse read is never issued.
    expect(mockStreamIOField).not.toHaveBeenCalled();
  });

  it("returns 404 when the trace does not exist", async () => {
    mockGetAuthorizedTrace.mockRejectedValue(
      new LangfuseNotFoundError("Trace not found"),
    );
    const { req, res } = createGetMocks(validQuery);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(mockStreamIOField).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported field", async () => {
    const { req, res } = createGetMocks({ ...validQuery, field: "secrets" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(mockGetAuthorizedTrace).not.toHaveBeenCalled();
    expect(mockStreamIOField).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is missing", async () => {
    const { req, res } = createGetMocks({
      traceId,
      observationId,
      field: "input",
      startTime,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(mockGetAuthorizedTrace).not.toHaveBeenCalled();
  });

  it("returns 400 for an unparseable startTime", async () => {
    const { req, res } = createGetMocks({
      ...validQuery,
      startTime: "not-a-date",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(mockStreamIOField).not.toHaveBeenCalled();
  });
});
