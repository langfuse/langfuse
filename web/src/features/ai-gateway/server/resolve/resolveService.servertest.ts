import type { PrismaClient } from "@langfuse/shared/src/db";
import { describe, expect, it, vi } from "vitest";

import { GatewayResolveService } from "./resolveService";

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST: ["org-1"],
    // Caching is covered against real Redis in the control-plane servertest;
    // these cases are about what the service does with a database row.
    LANGFUSE_CACHE_GATEWAY_RESOLVE_ENABLED: "false",
    LANGFUSE_GATEWAY_RESOLVE_TIMEOUT_MS: 20,
  },
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "sk-test"),
}));

const serviceWith = (findFirst: () => Promise<unknown>) =>
  new GatewayResolveService(
    { gatewayApiKeyAssociation: { findFirst } } as unknown as PrismaClient,
    {},
  );

const row = (overrides: {
  instrumentationMode?: string;
  projectOrgId?: string;
  metadata?: unknown;
}) => ({
  apiKeyId: "key-1",
  metadata: overrides.metadata,
  apiKey: {
    orgId: "org-1",
    organization: {
      gatewayConfig: {
        defaultIngestionProjectId: "project-1",
        instrumentationMode: overrides.instrumentationMode ?? "NONE",
        defaultIngestionProject: {
          id: "project-1",
          orgId: overrides.projectOrgId ?? "org-1",
          deletedAt: null,
        },
      },
      gatewayAiConnections: [
        {
          id: "connection-1",
          provider: "OPENAI",
          encryptedCredential: "encrypted-credential",
        },
      ],
    },
  },
});

describe("GatewayResolveService", () => {
  it("hands over the provider credential and cannot be told to attribute elsewhere", async () => {
    const service = serviceWith(() =>
      Promise.resolve(
        row({ metadata: { team: "platform", project_id: "spoofed-project" } }),
      ),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toEqual({
      version: 1,
      connection: {
        id: "connection-1",
        provider: "openai",
        api_format: "openai.responses",
        base_url: "https://api.openai.com/v1",
        auth: { type: "Bearer", token: "sk-test" },
      },
      // Metadata stays in its own object, so a metadata key called project_id
      // cannot redirect attribution.
      attribution: {
        organization_id: "org-1",
        project_id: "project-1",
        key_id: "key-1",
        key_metadata: { team: "platform", project_id: "spoofed-project" },
      },
      instrumentation_mode: "none",
      // Instrumentation is off, so no ingestion token is minted.
      ingestion: undefined,
    });
  });

  it("drops key metadata that is not a flat object of scalars", async () => {
    const service = serviceWith(() =>
      Promise.resolve(row({ metadata: [{ team: "platform" }] })),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      attribution: {
        organization_id: "org-1",
        project_id: "project-1",
        key_id: "key-1",
        key_metadata: {},
      },
    });
  });

  it("refuses to resolve when the ingestion project belongs to another organization", async () => {
    const service = serviceWith(() =>
      Promise.resolve(row({ projectOrgId: "org-other" })),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("sheds a slow database lookup as a retryable 503", async () => {
    // A saturated pool must not hold an LLM request open until Prisma's own
    // pool timeout fires, ten seconds of latency later.
    const service = serviceWith(() => new Promise(() => {}));

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejects an unknown or expired gateway key", async () => {
    const service = serviceWith(() => Promise.resolve(null));

    await expect(
      service.resolve({
        fastHashedSecretKey: "invalid-hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects gateway keys from organizations outside the allowlist", async () => {
    const service = serviceWith(() =>
      Promise.resolve({
        apiKeyId: "key-1",
        apiKey: {
          orgId: "org-not-allowed",
          organization: { gatewayConfig: null, gatewayAiConnections: [] },
        },
      }),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
