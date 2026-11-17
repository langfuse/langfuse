import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { prisma } from "@langfuse/shared/src/db";
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
import { topicsProject } from "@/src/__tests__/fixtures/topics";
import "@/src/features/mcp/server/bootstrap";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { authenticator } from "@/src/features/apiKey/authenticator";
import type { ServerContext } from "@/src/features/mcp/types";

const TOPICS_TOOLS = [
  "listTopicRules",
  "listTopicFacets",
  "listTopics",
  "listTopicSummaries",
  "listTopicAssignments",
];

async function contextFor(key: {
  projectId: string;
  orgId: string;
  publicKey: string;
  secretKey: string;
}): Promise<ServerContext> {
  const authenticated = await authenticator.authenticate({
    headers: {
      authorization: createBasicAuthHeader(key.publicKey, key.secretKey),
    },
  });
  if (!authenticated.success) throw authenticated.error;
  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { publicKey: key.publicKey },
    select: { id: true },
  });
  return {
    projectId: key.projectId,
    orgId: key.orgId,
    apiKeyId: apiKey.id,
    accessLevel: "project",
    publicKey: key.publicKey,
    plan: "oss",
    rateLimitOverrides: [],
    accessAuditLogEnabled: false,
    auth: authenticated.context,
  };
}

/** Connects an MCP client to the real server for one key's context. */
async function connect(context: ServerContext) {
  const server = createMcpServer(context);
  const client = new Client({ name: "topics-access-test", version: "1.0.0" });
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.callTool({ name, arguments: args });
  return {
    isError: result.isError === true,
    text: (result.content as { text: string }[])[0]?.text ?? "",
  };
}

describe("Topics MCP tools access", () => {
  let owner: Awaited<ReturnType<typeof topicsProject>>;
  let other: Awaited<ReturnType<typeof topicsProject>>;
  let ownerClient: Client;
  let otherClient: Client;
  const original = {
    enabled: sharedEnv.LANGFUSE_TOPICS_ENABLED,
    projectIds: sharedEnv.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS,
    region: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  beforeAll(async () => {
    owner = await topicsProject();
    other = await topicsProject();
    // The Topics gate reads shared env in this process.
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = "true";
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS = [
      owner.projectId,
      other.projectId,
    ];
    ownerClient = await connect(await contextFor(owner));
    otherClient = await connect(await contextFor(other));
  });

  afterAll(async () => {
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED = original.enabled;
    (sharedEnv as any).LANGFUSE_TOPICS_ENABLED_PROJECT_IDS =
      original.projectIds;
    (sharedEnv as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = original.region;
    await Promise.all([ownerClient.close(), otherClient.close()]);
  });

  it("lists the Topics tools only for a Topics project", async () => {
    const names = async (client: Client) =>
      (await client.listTools()).tools.map(({ name }) => name);
    expect(await names(ownerClient)).toEqual(
      expect.arrayContaining(TOPICS_TOOLS),
    );

    const plain = await createOrgProjectAndApiKey();
    const plainClient = await connect(await contextFor(plain));
    try {
      const plainTools = await names(plainClient);
      expect(plainTools.length).toBeGreaterThan(0);
      for (const tool of TOPICS_TOOLS) expect(plainTools).not.toContain(tool);
      // A direct call fails like an unknown tool, not just a hidden listing.
      for (const tool of TOPICS_TOOLS)
        await expect(
          plainClient.callTool({ name: tool, arguments: {} }),
        ).rejects.toThrow(`Unknown tool: ${tool}`);
    } finally {
      await plainClient.close();
    }
  });

  it("does not expose a project's Topics data to another project's key", async () => {
    const byTrace = [
      {
        type: "stringOptions",
        column: "traceId",
        operator: "any of",
        value: [owner.traceId],
      },
    ];
    const byTopic = [
      {
        type: "stringOptions",
        column: "topicId",
        operator: "any of",
        value: [owner.topicId],
      },
    ];
    const reads: [string, Record<string, unknown>, string][] = [
      ["listTopicRules", {}, owner.ruleId],
      ["listTopicFacets", {}, owner.facetId],
      ["listTopics", {}, owner.topicId],
      ["listTopicSummaries", { filter: byTopic }, owner.traceId],
      ["listTopicAssignments", { filter: byTopic }, owner.traceId],
    ];

    // Positive control: the owner's key reads each id through the same tool.
    for (const [tool, args, id] of reads) {
      const result = await callText(ownerClient, tool, args);
      expect(result.isError, `${tool}: ${result.text}`).toBe(false);
      expect(result.text).toContain(id);
    }

    for (const [tool, args, id] of [
      ...reads,
      ["listTopicSummaries", { filter: byTrace }, owner.traceId],
      ["listTopicAssignments", { filter: byTrace }, owner.traceId],
    ] as const) {
      const result = await callText(otherClient, tool, args);
      expect(result.isError, `${tool}: ${result.text}`).toBe(false);
      expect(result.text).not.toContain(id);
    }
  });

  it("denies a key without topics:read", async () => {
    const creator = await prisma.user.create({
      data: { email: `topics-mcp-ingest-${randomUUID()}@example.com` },
    });
    const ingestKey = await createApiKey(prisma, {
      tenant: OrganizationId(owner.orgId),
      scope: ProjectId(owner.projectId),
      role: SystemRoleId("INGEST"),
      createdBy: UserId(creator.id),
    });
    const client = await connect(await contextFor({ ...owner, ...ingestKey }));
    try {
      for (const tool of TOPICS_TOOLS)
        await expect(
          client.callTool({ name: tool, arguments: {} }),
        ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
