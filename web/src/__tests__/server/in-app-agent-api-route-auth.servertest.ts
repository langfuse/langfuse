import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";

describe("in-app agent public API route auth", () => {
  async function createInAppAgentAuthHeader() {
    const { projectId } = await createOrgProjectAndApiKey();
    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      isInAppAgentKey: true,
    });

    return createBasicAuthHeader(apiKey.publicKey, apiKey.secretKey);
  }

  async function callRoute(params: { allowInAppAgentKey?: boolean }) {
    const handler = createAuthedProjectAPIRoute({
      name: "Test Route",
      ...(params.allowInAppAgentKey === undefined
        ? {}
        : { allowInAppAgentKey: params.allowInAppAgentKey }),
      querySchema: z.object({}),
      responseSchema: z.object({ ok: z.literal(true) }),
      fn: async () => ({ ok: true as const }),
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: await createInAppAgentAuthHeader(),
      },
      query: {},
    });

    await handler(req, res);

    return res;
  }

  it("rejects in-app agent keys when allowInAppAgentKey is omitted", async () => {
    const res = await callRoute({});

    expect(res.statusCode).toBe(403);
    expect(res._getJSONData()).toEqual({
      message:
        "Access denied - in-app agent keys are not allowed for this endpoint",
    });
  });

  it("rejects in-app agent keys when allowInAppAgentKey is false", async () => {
    const res = await callRoute({ allowInAppAgentKey: false });

    expect(res.statusCode).toBe(403);
    expect(res._getJSONData()).toEqual({
      message:
        "Access denied - in-app agent keys are not allowed for this endpoint",
    });
  });

  it("allows in-app agent keys when allowInAppAgentKey is true", async () => {
    const res = await callRoute({ allowInAppAgentKey: true });

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
  });
});
