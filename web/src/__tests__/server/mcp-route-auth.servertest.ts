import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import {
  createApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import { prisma, type SystemRole } from "@langfuse/shared/src/db";

import mcpHandler from "@/src/pages/api/public/mcp";
import { authenticator } from "@/src/features/apiKey/authenticator";
import { handleListProjects } from "@/src/features/mcp/server/projects/tools/listProjects";
import type { McpConnection } from "@/src/features/mcp/types";

type KeyPair = { publicKey: string; secretKey: string };

const adminApiKey = "test-admin-api-key-mcp-route-auth";

const initializeBody = {
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "route-auth", version: "1.0.0" },
  },
  id: 1,
};

const baseHeaders = {
  host: "localhost:3000",
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

/** callMcp invokes the MCP route with a POST initialize, returning the status code. */
async function callMcp(authorization: Record<string, string>): Promise<number> {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: initializeBody,
    headers: { ...baseHeaders, ...authorization },
  });
  await mcpHandler(req, res);
  return res._getStatusCode();
}

/** createKey creates an api key with a role, bound to a project or to the organization. */
async function createKey(params: {
  orgId: string;
  projectId?: string;
  role: SystemRole;
  isInAppAgentKey?: boolean;
}): Promise<KeyPair> {
  const creator = await prisma.user.create({
    data: { email: `apikey-creator-${randomUUID()}@example.com` },
  });
  const key = await createApiKey(prisma, {
    tenant: OrganizationId(params.orgId),
    scope: params.projectId
      ? ProjectId(params.projectId)
      : OrganizationId(params.orgId),
    role: SystemRoleId(params.role),
    createdBy: UserId(creator.id),
    isInAppAgentKey: params.isInAppAgentKey,
  });
  return { publicKey: key.publicKey, secretKey: key.secretKey };
}

/** connect authenticates a key the way the MCP route does. */
async function connect(key: KeyPair): Promise<McpConnection> {
  const auth = await authenticator.authenticate({
    headers: { authorization: `Bearer ${key.secretKey}` },
  });
  if (!auth.success) throw auth.error;
  const { principal } = auth.context;
  if (principal.kind !== "apiKey") throw new Error("expected an api key");
  return {
    auth: auth.context,
    apiKeyId: principal.apiKeyId,
    publicKey: principal.publicKey,
    boundProjectId: principal.boundResource.projectId,
  };
}

describe("MCP route auth", () => {
  let orgId = "";
  let projectId = "";
  let secondProjectId = "";
  let projectKey: KeyPair;
  let agentKey: KeyPair;
  let orgKey: KeyPair;
  let originalMigration: string | undefined;
  let originalAdminApiKey: string | undefined;

  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    (env as any).ADMIN_API_KEY = adminApiKey;

    const base = await createOrgProjectAndApiKey();
    orgId = base.orgId;
    projectId = base.projectId;
    projectKey = { publicKey: base.publicKey, secretKey: base.secretKey };

    const second = await prisma.project.create({
      data: { name: `zz-second-${randomUUID()}`, orgId },
    });
    secondProjectId = second.id;

    orgKey = await createKey({ orgId, role: "ADMIN" });
    agentKey = await createKey({
      orgId,
      projectId,
      role: "LEGACY_PROJECT_API_KEY",
      isInAppAgentKey: true,
    });
  });

  afterAll(() => {
    (env as any).API_AUTH_MIGRATION = originalMigration;
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
  });

  it.each(["legacy", "shadow", "enforce"])(
    "connects every secret key and rejects other credentials in %s",
    async (mode) => {
      (env as any).API_AUTH_MIGRATION = mode;

      const statuses = {
        "project/basic": await callMcp({
          authorization: createBasicAuthHeader(projectId, projectKey.secretKey),
        }),
        "project/bearer-secret": await callMcp({
          authorization: `Bearer ${projectKey.secretKey}`,
        }),
        "project/bearer-public": await callMcp({
          authorization: `Bearer ${projectKey.publicKey}`,
        }),
        "agent/basic": await callMcp({
          authorization: createBasicAuthHeader(
            agentKey.publicKey,
            agentKey.secretKey,
          ),
        }),
        "org/basic": await callMcp({
          authorization: createBasicAuthHeader(
            orgKey.publicKey,
            orgKey.secretKey,
          ),
        }),
        "org/bearer-secret": await callMcp({
          authorization: `Bearer ${orgKey.secretKey}`,
        }),
        admin: await callMcp({
          authorization: `Bearer ${adminApiKey}`,
          "x-langfuse-admin-api-key": adminApiKey,
          "x-langfuse-project-id": projectId,
        }),
      };

      expect(statuses).toEqual({
        "project/basic": 200,
        "project/bearer-secret": 200,
        "project/bearer-public": 403,
        "agent/basic": 200,
        "org/basic": 200,
        "org/bearer-secret": 200,
        admin: 401,
      });
    },
  );

  it("lists every project of the organization for an organization key", async () => {
    const result = await handleListProjects({}, await connect(orgKey));
    expect(result).toEqual({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: projectId }),
        expect.objectContaining({ id: secondProjectId }),
      ]),
    });
  });

  it("lists only its own project for a project key", async () => {
    const result = await handleListProjects({}, await connect(projectKey));
    expect(result).toEqual({
      projects: [expect.objectContaining({ id: projectId })],
    });
  });

  it("leaves deleted projects out", async () => {
    const deleted = await prisma.project.create({
      data: { name: `deleted-${randomUUID()}`, orgId, deletedAt: new Date() },
    });
    const result = (await handleListProjects({}, await connect(orgKey))) as {
      projects: { id: string }[];
    };
    expect(result.projects.map((p) => p.id)).not.toContain(deleted.id);
  });
});
