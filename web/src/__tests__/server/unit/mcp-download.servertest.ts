import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@langfuse/shared";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { stringify } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import type { ServerContext } from "@/src/features/mcp/types";
import { handleDownloadFullTrace } from "@/src/features/mcp/server/observations/tools/downloadFullTrace";
import { handleExportObservation } from "@/src/features/mcp/server/observations/tools/exportObservation";
import { observationsFeature } from "@/src/features/mcp/server/observations";
import { buildTraceExport } from "@/src/features/traces/server/buildTraceExport";
import handler from "@/src/pages/api/mcp/download";

const mocks = vi.hoisted(() => ({
  trace: vi.fn(),
  count: vi.fn(),
  observations: vi.fn(),
  lookupObservation: vi.fn(),
  scores: vi.fn(),
  apiKey: vi.fn(),
  resolve: vi.fn(),
  authorize: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importActual) => ({
  ...(await importActual<object>()),
  getTraceByIdFromEventsTable: mocks.trace,
  getObservationsCountFromEventsTable: mocks.count,
  getObservationsForTraceFromEventsTable: mocks.observations,
  getObservationsV2FromEventsTableForPublicApi: mocks.lookupObservation,
  getScoresAndCorrectionsForTraces: mocks.scores,
}));
vi.mock("@langfuse/shared/src/db", async (importActual) => ({
  ...(await importActual<object>()),
  prisma: { apiKey: { findFirst: mocks.apiKey } },
}));
vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: mocks.audit,
}));
vi.mock("@/src/server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: vi.fn(),
}));
vi.mock("@/src/features/auth/policy/contextResolver", () => ({
  ContextResolver: class {
    resolve = mocks.resolve;
  },
}));
vi.mock("@/src/features/public-api/server/shadowAuth", () => ({
  shadowAuthorize: mocks.authorize,
}));
vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({ rateLimitRequest: mocks.rateLimit }),
  },
}));

const context: ServerContext = {
  projectId: "project-1",
  orgId: "org-1",
  apiKeyId: "key-1",
  publicKey: "pk-lf-test",
  accessLevel: "project",
  plan: "oss",
  rateLimitOverrides: [],
};
const now = new Date("2026-10-09T12:00:00Z");
const trace = {
  id: "trace-1",
  projectId: context.projectId,
  timestamp: now,
  name: "Example trace",
  public: false,
  tags: ["example"],
};
const observation = {
  id: "observation-1",
  traceId: trace.id,
  projectId: context.projectId,
  type: "GENERATION",
  name: "Example observation",
  startTime: now,
  endTime: now,
  createdAt: now,
  updatedAt: now,
  input: '{"secret":"payload stays in the file"}',
  output: '{"text":"\\u65e5\\u672c"}',
  metadata: { tag: "full metadata" },
  toolDefinitions: { lookup: { description: "Find a record" } },
  toolCalls: [{ name: "lookup" }],
  toolCallNames: ["lookup"],
};
const authContext = {
  principal: {
    kind: "apiKey",
    apiKeyId: context.apiKeyId,
    publicKey: context.publicKey,
    presentation: "privateKey",
    boundResource: { orgId: context.orgId, projectId: context.projectId },
    organizations: [
      {
        orgId: context.orgId,
        projectIds: [context.projectId],
        plan: "oss",
        rateLimitOverrides: [],
        isIngestionSuspended: false,
      },
    ],
  },
  policies: [],
};
const originalEnv = {
  NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: env.NEXTAUTH_URL,
  API_AUTH_MIGRATION: env.API_AUTH_MIGRATION,
  LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN:
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN,
};
const originalSizeLimit =
  sharedEnv.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES;

async function createLink(observationId?: string) {
  const result = observationId
    ? await handleExportObservation({ observationId }, context)
    : await handleDownloadFullTrace({ traceId: trace.id }, context);
  return result as {
    downloadUrl: string;
    filename: string;
    mimeType: string;
    expiresAt: string;
  };
}

async function download(url: string, method: "GET" | "POST" = "GET") {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: Object.fromEntries(new URL(url).searchParams),
  });
  await handler(req, res);
  return res;
}

describe("MCP JSON downloads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    Object.assign(env, {
      NEXTAUTH_SECRET: "mcp-download-test-secret",
      NEXTAUTH_URL: "https://langfuse.example/base/api/auth",
      API_AUTH_MIGRATION: "enforce",
      LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "true",
    });
    mocks.trace.mockResolvedValue(trace);
    mocks.count.mockResolvedValue(1);
    mocks.observations.mockResolvedValue({ observations: [observation] });
    mocks.lookupObservation.mockResolvedValue([observation]);
    mocks.scores.mockResolvedValue([]);
    mocks.apiKey.mockResolvedValue({
      id: context.apiKeyId,
      projectId: context.projectId,
      scope: "PROJECT",
      expiresAt: null,
    });
    mocks.resolve.mockResolvedValue({ success: true, context: authContext });
    mocks.authorize.mockReturnValue({ success: true });
    mocks.rateLimit.mockResolvedValue({ isRateLimited: () => false });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.assign(env, originalEnv);
    sharedEnv.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES =
      originalSizeLimit;
  });

  it.each([349, 350])(
    "downloads the same JSON as the UI at %i observations, without payload in the MCP result",
    async (count) => {
      mocks.count.mockResolvedValue(count);
      const link = await createLink();
      expect(Object.keys(link).sort()).toEqual([
        "downloadUrl",
        "expiresAt",
        "filename",
        "mimeType",
      ]);
      expect(JSON.stringify(link)).not.toContain("payload stays in the file");
      expect(new URL(link.downloadUrl).pathname).toBe("/base/api/mcp/download");
      expect(mocks.observations).not.toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith({
        resourceType: "trace",
        resourceId: trace.id,
        action: "download",
        apiKeyId: context.apiKeyId,
        orgId: context.orgId,
        projectId: context.projectId,
      });

      const res = await download(link.downloadUrl);
      const uiPayload = await buildTraceExport({
        traceId: trace.id,
        projectId: context.projectId,
        session: {
          user: {
            email: "test@example.com",
            organizations: [{ projects: [{ id: context.projectId }] }],
          },
        },
      });
      expect(res._getStatusCode()).toBe(200);
      expect(res._getData()).toBe(stringify(uiPayload, undefined, 2));
      expect(res.getHeader("Cache-Control")).toBe("private, no-store");
      expect(res.getHeader("Content-Disposition")).toContain(
        "trace-trace-1.json",
      );
      const body = JSON.parse(res._getData());
      expect(body.observations[0]).toHaveProperty("toolCallNames", ["lookup"]);
      for (const field of [
        "input",
        "output",
        "metadata",
        "toolDefinitions",
        "toolCalls",
      ]) {
        if (count >= 350)
          expect(body.observations[0]).not.toHaveProperty(field);
        else expect(body.observations[0]).toHaveProperty(field);
      }
      expect(mocks.observations).toHaveBeenCalledWith({
        traceId: trace.id,
        projectId: context.projectId,
        timestamp: now,
        selectIOAndMetadata: count < 350,
        selectToolData: count < 350,
      });
    },
  );

  it("selects only the requested observation and its scores from the bounded trace export", async () => {
    mocks.observations.mockResolvedValue({
      observations: [
        observation,
        { ...observation, id: "child-1", parentObservationId: observation.id },
      ],
    });
    const score = {
      id: "score-1",
      traceId: trace.id,
      dataType: "NUMERIC",
      createdAt: now,
      updatedAt: now,
      timestamp: now,
    };
    mocks.scores.mockResolvedValue([
      { ...score, observationId: observation.id },
      { ...score, id: "trace-score", observationId: null },
      { ...score, id: "child-score", observationId: "child-1" },
    ]);
    const link = await createLink(observation.id);
    const res = await download(link.downloadUrl);
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.observations.map((item: { id: string }) => item.id)).toEqual([
      observation.id,
    ]);
    expect(body.scores.map((item: { id: string }) => item.id)).toEqual([
      "score-1",
    ]);
    expect(mocks.lookupObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: context.projectId,
        fields: ["core"],
      }),
    );
  });

  it.each([undefined, observation.id])(
    "enforces the UI payload limit before selecting %s",
    async (id) => {
      sharedEnv.LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES = 1;
      const link = await createLink(id);
      const res = await download(link.downloadUrl);
      expect(res._getStatusCode()).toBe(422);
      expect(JSON.parse(res._getData()).message).toContain(
        "Observations in trace are too large",
      );
    },
  );

  it("does not fetch beyond the UI observation cap to recover a missing observation", async () => {
    const link = await createLink(observation.id);
    mocks.observations.mockResolvedValue({ observations: [] });
    const res = await download(link.downloadUrl);
    expect(res._getStatusCode()).toBe(404);
    expect(mocks.lookupObservation).toHaveBeenCalledTimes(1);
  });

  it.each(["projectId", "traceId", "observationId", "apiKeyId", "expiresAt"])(
    "rejects tampering with the signed %s before querying data",
    async (field) => {
      const url = new URL((await createLink()).downloadUrl);
      const [payload, signature] = url.searchParams.get("token")!.split(".");
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      claims[field] =
        field === "expiresAt" ? now.getTime() + 86400000 : "another-resource";
      url.searchParams.set(
        "token",
        `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`,
      );
      expect((await download(url.toString()))._getStatusCode()).toBe(401);
      expect(mocks.apiKey).not.toHaveBeenCalled();
      expect(mocks.observations).not.toHaveBeenCalled();
    },
  );

  it("rejects expired links before querying data", async () => {
    const link = await createLink();
    vi.setSystemTime(new Date(link.expiresAt));
    expect((await download(link.downloadUrl))._getStatusCode()).toBe(401);
    expect(mocks.apiKey).not.toHaveBeenCalled();
  });

  it.each([null, { expiresAt: now }])(
    "rejects revoked or expired API keys: %j",
    async (key) => {
      const link = await createLink();
      mocks.apiKey.mockResolvedValue(key);
      expect((await download(link.downloadUrl))._getStatusCode()).toBe(401);
      expect(mocks.apiKey).toHaveBeenCalledWith({
        where: {
          id: context.apiKeyId,
          projectId: context.projectId,
          scope: "PROJECT",
          project: { deletedAt: null },
        },
      });
      expect(mocks.observations).not.toHaveBeenCalled();
    },
  );

  it("rechecks traces:read permission before reading the export", async () => {
    const link = await createLink();
    mocks.authorize.mockReturnValue({
      success: false,
      error: new ForbiddenError(),
    });
    expect((await download(link.downloadUrl))._getStatusCode()).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: authContext,
        action: "traces:read",
        resource: { projectId: context.projectId },
      }),
    );
    expect(mocks.observations).not.toHaveBeenCalled();
  });

  it("keeps legacy authorization behavior when redeeming a link", async () => {
    Object.assign(env, { API_AUTH_MIGRATION: "legacy" });
    const link = await createLink();
    expect((await download(link.downloadUrl))._getStatusCode()).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ ctx: undefined }),
    );
  });

  it("rate limits downloads before querying the export", async () => {
    const link = await createLink();
    mocks.rateLimit.mockResolvedValue({
      isRateLimited: () => true,
      sendRestResponseIfLimited: (res: NextApiResponse) =>
        res.status(429).end(),
    });
    expect((await download(link.downloadUrl))._getStatusCode()).toBe(429);
    expect(mocks.observations).not.toHaveBeenCalled();
  });

  it("requires a valid GET capability even for public traces", async () => {
    mocks.trace.mockResolvedValue({ ...trace, public: true });
    const link = await createLink();
    expect((await download(link.downloadUrl, "POST"))._getStatusCode()).toBe(
      405,
    );
    expect(
      (
        await download("https://langfuse.example/api/mcp/download")
      )._getStatusCode(),
    ).toBe(401);
  });

  it("registers both tools behind the observation feature gate", async () => {
    expect(
      observationsFeature.tools.map((tool) => tool.definition.name),
    ).toEqual(expect.arrayContaining(["downloadFullTrace", "exportObservation"]));
    const link = await createLink();
    Object.assign(env, { LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "false" });
    expect(await observationsFeature.isEnabled()).toBe(false);
    expect((await download(link.downloadUrl))._getStatusCode()).toBe(404);
  });

  it("does not issue links for resources absent from the authenticated project", async () => {
    mocks.lookupObservation.mockResolvedValue([]);
    await expect(createLink("foreign-observation")).rejects.toThrow();
    mocks.trace.mockResolvedValue(undefined);
    await expect(createLink()).rejects.toThrow();
    expect(mocks.trace).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: context.projectId }),
    );
  });
});
