import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  QueueJobs,
} from "@langfuse/shared/src/server";

const mockAdd = vi.fn();

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const originalModule = await importOriginal<Record<string, unknown>>();
  return {
    ...originalModule,
    AuditLogQueue: {
      getInstance: vi.fn(() => ({ add: mockAdd })),
    },
  };
});

import getTraceHandler from "@/src/pages/api/public/traces/[traceId]";
import listTracesHandler from "@/src/pages/api/public/traces/index";
import listSessionsHandler from "@/src/pages/api/public/sessions/index";

const enqueuedPayloads = () =>
  mockAdd.mock.calls.map(
    (call) =>
      (call[1] as { payload: Record<string, unknown> }).payload as Record<
        string,
        unknown
      >,
  );

const callHandler = async (
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  args: { auth: string; query: Record<string, string>; url: string },
) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    url: args.url,
    headers: { authorization: args.auth },
    query: args.query,
  });
  await handler(req, res);
  return res;
};

describe("public API access events", () => {
  let orgId: string;
  let projectId: string;
  let apiKeyId: string;
  let auth: string;
  let traceId: string;

  beforeEach(async () => {
    mockAdd.mockReset();
    mockAdd.mockResolvedValue(undefined);

    const created = await createOrgProjectAndApiKey();
    orgId = created.orgId;
    projectId = created.projectId;
    auth = created.auth;
    apiKeyId = (
      await prisma.apiKey.findFirstOrThrow({
        where: { publicKey: created.publicKey },
        select: { id: true },
      })
    ).id;
    traceId = randomUUID();
    await createTracesCh([
      createTrace({ id: traceId, project_id: projectId, name: "api-read" }),
    ]);
  });

  it("records a single trace read with the API key as actor", async () => {
    const res = await callHandler(getTraceHandler, {
      auth,
      url: `/api/public/traces/${traceId}`,
      query: { traceId },
    });
    expect(res._getStatusCode()).toBe(200);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toBe(QueueJobs.AuditLogJob);
    const payload = enqueuedPayloads()[0];
    expect(payload).toMatchObject({
      org_id: orgId,
      project_id: projectId,
      event_kind: "access",
      actor_type: "API_KEY",
      api_key_id: apiKeyId,
      user_id: "",
      user_org_role: "",
      user_project_role: "",
      resource_type: "trace",
      resource_id: traceId,
      action: "read",
      surface: "public-api",
      route: "GET /api/public/traces/{traceId}",
      result_count: 1,
    });
    expect(JSON.parse(payload.params as string)).toMatchObject({ traceId });
  });

  it("records a list with the parsed query and the number of returned rows", async () => {
    const res = await callHandler(listTracesHandler, {
      auth,
      url: "/api/public/traces?limit=10&page=1",
      query: { limit: "10", page: "1", name: "api-read" },
    });
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData() as { data: unknown[] };

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const payload = enqueuedPayloads()[0];
    expect(payload).toMatchObject({
      org_id: orgId,
      project_id: projectId,
      actor_type: "API_KEY",
      api_key_id: apiKeyId,
      resource_type: "trace",
      resource_id: "",
      action: "list",
      route: "GET /api/public/traces",
      result_count: body.data.length,
    });
    expect(body.data.length).toBeGreaterThan(0);
    expect(JSON.parse(payload.params as string)).toMatchObject({
      limit: 10,
      page: 1,
      name: "api-read",
    });
  });

  it("records an empty list with a zero count", async () => {
    const res = await callHandler(listSessionsHandler, {
      auth,
      url: "/api/public/sessions",
      query: {},
    });
    expect(res._getStatusCode()).toBe(200);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(enqueuedPayloads()[0]).toMatchObject({
      resource_type: "session",
      action: "list",
      route: "GET /api/public/sessions",
      result_count: 0,
    });
  });

  it("does not record failed requests", async () => {
    const notFound = await callHandler(getTraceHandler, {
      auth,
      url: `/api/public/traces/${randomUUID()}`,
      query: { traceId: randomUUID() },
    });
    expect(notFound._getStatusCode()).toBe(404);

    const unauthorized = await callHandler(getTraceHandler, {
      auth: "Basic invalid",
      url: `/api/public/traces/${traceId}`,
      query: { traceId },
    });
    expect(unauthorized._getStatusCode()).toBe(401);

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("fails open when the queue rejects", async () => {
    mockAdd.mockRejectedValueOnce(new Error("redis down"));

    const res = await callHandler(getTraceHandler, {
      auth,
      url: `/api/public/traces/${traceId}`,
      query: { traceId },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it("does not record a read whose response was too large to serialize", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      url: `/api/public/traces/${traceId}`,
      headers: { authorization: auth },
      query: { traceId },
    });
    // Only the success body blows up; the error body must still go out.
    const sendJson = res.json.bind(res);
    let serializations = 0;
    res.json = ((body: unknown) => {
      if (serializations++ === 0) {
        throw new RangeError("Invalid string length");
      }
      return sendJson(body);
    }) as typeof res.json;

    await getTraceHandler(req, res);

    expect(res._getStatusCode()).toBe(422);
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
