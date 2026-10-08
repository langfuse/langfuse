import { randomUUID } from "node:crypto";

import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
  createShaHash,
  getDisplaySecretKey,
} from "@langfuse/shared/src/server";

import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { env } from "@/src/env.mjs";
import {
  DeleteLlmConnectionV1Response,
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";

async function createOrganizationApiKey(orgId: string): Promise<string> {
  const publicKey = `pk-lf-${randomUUID()}`;
  const secretKey = `sk-lf-${randomUUID()}`;
  const apiKeyId = randomUUID();

  await prisma.$transaction([
    prisma.apiKey.create({
      data: {
        id: apiKeyId,
        orgId,
        publicKey,
        hashedSecretKey: `test-hashed-secret-key-${randomUUID()}`,
        fastHashedSecretKey: createShaHash(secretKey, env.SALT as string),
        displaySecretKey: getDisplaySecretKey(secretKey),
        scope: "ORGANIZATION",
      },
    }),
    prisma.roleAssignment.create({
      data: {
        orgId,
        principalApiKeyId: apiKeyId,
        systemRole: "LEGACY_ORGANIZATION_API_KEY",
        ownerOrgId: orgId,
      },
    }),
  ]);

  return createBasicAuthHeader(publicKey, secretKey);
}

describe("/api/public/organizations/llm-connections", () => {
  it("creates and lists organization connections without exposing secrets", async () => {
    const fixture = await createOrgProjectAndApiKey({ plan: "Team" });
    const auth = await createOrganizationApiKey(fixture.orgId);
    const provider = `organization-provider-${randomUUID()}`;
    const secretKey = "sk-organization-secret";
    const extraHeaderValue = "private-header-value";

    const createResponse = await makeZodVerifiedAPICall(
      PutLlmConnectionV1Response,
      "PUT",
      "/api/public/organizations/llm-connections",
      {
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey,
        extraHeaders: { Authorization: extraHeaderValue },
      },
      auth,
      201,
    );

    expect(createResponse.body).not.toHaveProperty("secretKey");
    expect(createResponse.body).not.toHaveProperty("extraHeaders");
    expect(JSON.stringify(createResponse.body)).not.toContain(secretKey);
    expect(JSON.stringify(createResponse.body)).not.toContain(extraHeaderValue);

    const stored = await prisma.llmApiKeys.findUnique({
      where: {
        organizationId_provider: {
          organizationId: fixture.orgId,
          provider,
        },
      },
    });
    expect(stored).toMatchObject({
      projectId: null,
      organizationId: fixture.orgId,
      provider,
    });
    expect(stored?.secretKey).not.toBe(secretKey);

    const listResponse = await makeZodVerifiedAPICall(
      GetLlmConnectionsV1Response,
      "GET",
      "/api/public/organizations/llm-connections",
      undefined,
      auth,
    );

    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({
      id: createResponse.body.id,
      provider,
      extraHeaderKeys: ["Authorization"],
    });
    expect(JSON.stringify(listResponse.body)).not.toContain(secretKey);
    expect(JSON.stringify(listResponse.body)).not.toContain(extraHeaderValue);
  });

  it("rejects project API keys on organization routes", async () => {
    const fixture = await createOrgProjectAndApiKey({ plan: "Team" });

    const response = await makeAPICall(
      "GET",
      "/api/public/organizations/llm-connections",
      undefined,
      fixture.auth,
    );

    expect(response.status).toBe(403);
  });

  it("does not delete a connection owned by another organization", async () => {
    const [caller, other] = await Promise.all([
      createOrgProjectAndApiKey({ plan: "Team" }),
      createOrgProjectAndApiKey({ plan: "Team" }),
    ]);
    const auth = await createOrganizationApiKey(caller.orgId);
    const otherConnection = await prisma.llmApiKeys.create({
      data: {
        organizationId: other.orgId,
        provider: `other-provider-${randomUUID()}`,
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-other"),
        displaySecretKey: "...1234",
      },
    });

    const response = await makeAPICall(
      "DELETE",
      `/api/public/organizations/llm-connections/${otherConnection.id}`,
      undefined,
      auth,
    );

    expect(response.status).toBe(404);
    expect(
      await prisma.llmApiKeys.findUnique({
        where: { id: otherConnection.id },
      }),
    ).not.toBeNull();
  });

  it("deletes an organization connection with its owning key", async () => {
    const fixture = await createOrgProjectAndApiKey({ plan: "Team" });
    const auth = await createOrganizationApiKey(fixture.orgId);
    const connection = await prisma.llmApiKeys.create({
      data: {
        organizationId: fixture.orgId,
        provider: `delete-provider-${randomUUID()}`,
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-delete"),
        displaySecretKey: "...lete",
      },
    });

    const response = await makeZodVerifiedAPICall(
      DeleteLlmConnectionV1Response,
      "DELETE",
      `/api/public/organizations/llm-connections/${connection.id}`,
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect(
      await prisma.llmApiKeys.findUnique({ where: { id: connection.id } }),
    ).toBeNull();
  });
});
