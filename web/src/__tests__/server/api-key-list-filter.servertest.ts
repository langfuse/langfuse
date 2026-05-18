import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { handleGetApiKeys as handleGetProjectApiKeys } from "@/src/ee/features/admin-api/server/projects/projectById/apiKeys";
import { handleGetApiKeys as handleGetOrganizationApiKeys } from "@/src/ee/features/admin-api/server/organizations/apiKeys";
import type { NextApiRequest, NextApiResponse } from "next";

function createMockResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  return response as NextApiResponse & {
    statusCode: number;
    body: { apiKeys: Array<{ id: string; note: string | null }> };
  };
}

describe("public API key list filters", () => {
  it("filters in-app agent keys from project API key responses", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const visibleKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "Visible project key",
    });

    const inAppAgentKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      note: "Hidden project in-app agent key",
      isInAppAgentKey: true,
    });

    const response = createMockResponse();
    await handleGetProjectApiKeys({} as NextApiRequest, response, projectId);

    expect(response.statusCode).toBe(200);
    expect(response.body.apiKeys.map((key) => key.id)).toContain(visibleKey.id);
    expect(response.body.apiKeys.map((key) => key.id)).not.toContain(
      inAppAgentKey.id,
    );
    expect(response.body.apiKeys.map((key) => key.note)).not.toContain(
      "Hidden project in-app agent key",
    );
  });

  it("filters in-app agent keys from organization API key responses", async () => {
    const { orgId } = await createOrgProjectAndApiKey();

    const visibleKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: orgId,
      scope: "ORGANIZATION",
      note: "Visible org key",
    });

    const inAppAgentKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: orgId,
      scope: "ORGANIZATION",
      note: "Hidden org in-app agent key",
      isInAppAgentKey: true,
    });

    const response = createMockResponse();
    await handleGetOrganizationApiKeys({} as NextApiRequest, response, orgId);

    expect(response.statusCode).toBe(200);
    expect(response.body.apiKeys.map((key) => key.id)).toContain(visibleKey.id);
    expect(response.body.apiKeys.map((key) => key.id)).not.toContain(
      inAppAgentKey.id,
    );
    expect(response.body.apiKeys.map((key) => key.note)).not.toContain(
      "Hidden org in-app agent key",
    );
  });
});
