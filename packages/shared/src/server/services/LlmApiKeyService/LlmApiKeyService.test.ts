import { type LlmApiKeys } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { LlmApiKeyService } from "./LlmApiKeyService";

const projectId = "project-id";
const organizationId = "organization-id";

const connection = (
  overrides: Partial<LlmApiKeys> & Pick<LlmApiKeys, "id" | "provider">,
): LlmApiKeys => ({
  id: overrides.id,
  provider: overrides.provider,
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
  ...overrides,
});

describe("LlmApiKeyService", () => {
  it("prefers a project connection over an organization connection", async () => {
    const repository = {
      findByProjectAndOrganization: vi.fn().mockResolvedValue({
        organizationId,
        connections: [
          connection({
            id: "organization-connection",
            provider: "openai",
            organizationId,
          }),
          connection({
            id: "project-connection",
            provider: "openai",
            projectId,
          }),
        ],
      }),
    };

    const resolved = await new LlmApiKeyService(repository).resolve({
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
    const repository = {
      findByProjectAndOrganization: vi.fn().mockResolvedValue({
        organizationId,
        connections: [
          connection({
            id: "organization-connection",
            provider: "anthropic",
            organizationId,
          }),
        ],
      }),
    };

    const resolved = await new LlmApiKeyService(repository).resolve({
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
    const repository = {
      findByProjectAndOrganization: vi.fn().mockResolvedValue({
        organizationId,
        connections: [
          connection({
            id: "organization-openai",
            provider: "openai",
            organizationId,
          }),
          connection({
            id: "project-openai",
            provider: "openai",
            projectId,
          }),
          connection({
            id: "organization-anthropic",
            provider: "anthropic",
            organizationId,
          }),
        ],
      }),
    };

    const effective = await new LlmApiKeyService(repository).listEffective(
      projectId,
    );

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
