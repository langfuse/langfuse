import { type LlmApiKeys } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { listEffectiveLlmApiKeys, resolveLlmApiKey } from "./LlmApiKeyService";

const mocks = vi.hoisted(() => ({
  findProjectLlmApiKeyCandidates: vi.fn(),
}));

vi.mock("./LlmApiKeyRepository", () => ({
  findProjectLlmApiKeyCandidates: mocks.findProjectLlmApiKeyCandidates,
}));

const projectId = "project-id";
const organizationId = "organization-id";

const connection = (
  overrides: Partial<LlmApiKeys> & Pick<LlmApiKeys, "id" | "provider">,
): LlmApiKeys => {
  const { id, provider, ...rest } = overrides;
  return {
    id,
    provider,
    adapter: "openai",
    secretKey: "encrypted-secret",
    displaySecretKey: "...cret",
    baseURL: null,
    customModels: [],
    withDefaultModels: true,
    extraHeaders: null,
    extraHeaderKeys: [],
    config: null,
    projectId: null,
    organizationId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...rest,
  };
};

describe("LlmApiKeyService", () => {
  it("prefers a project connection over an organization connection", async () => {
    mocks.findProjectLlmApiKeyCandidates.mockResolvedValue({
      organizationConnections: [
        connection({
          id: "organization-connection",
          provider: "openai",
          organizationId,
        }),
      ],
      projectConnections: [
        connection({
          id: "project-connection",
          provider: "openai",
          projectId,
        }),
      ],
    });

    const resolved = await resolveLlmApiKey({
      projectId,
      provider: "openai",
    });

    expect(resolved).toMatchObject({
      id: "project-connection",
      projectId,
      provider: "openai",
    });
    expect(resolved).not.toHaveProperty("organizationId");
  });

  it("falls back to the organization connection", async () => {
    mocks.findProjectLlmApiKeyCandidates.mockResolvedValue({
      projectConnections: [],
      organizationConnections: [
        connection({
          id: "organization-connection",
          provider: "anthropic",
          organizationId,
        }),
      ],
    });

    const resolved = await resolveLlmApiKey({
      projectId,
      provider: "anthropic",
    });

    expect(resolved).toMatchObject({
      id: "organization-connection",
      projectId,
      provider: "anthropic",
    });
    expect(resolved).not.toHaveProperty("organizationId");
  });

  it("lists one effective connection per provider with override metadata", async () => {
    mocks.findProjectLlmApiKeyCandidates.mockResolvedValue({
      organizationConnections: [
        connection({
          id: "organization-openai",
          provider: "openai",
          organizationId,
        }),
        connection({
          id: "organization-anthropic",
          provider: "anthropic",
          organizationId,
        }),
      ],
      projectConnections: [
        connection({
          id: "project-openai",
          provider: "openai",
          projectId,
        }),
      ],
    });

    const effective = await listEffectiveLlmApiKeys(projectId);

    expect(effective).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "project",
          organizationConnectionId: "organization-openai",
          connection: expect.objectContaining({ id: "project-openai" }),
        }),
        expect.objectContaining({
          scope: "organization",
          connection: expect.objectContaining({
            id: "organization-anthropic",
          }),
        }),
      ]),
    );
    expect(effective).toHaveLength(2);
  });
});
