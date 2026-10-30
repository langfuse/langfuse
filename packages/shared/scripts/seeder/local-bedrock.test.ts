import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "../../src/encryption";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../src/interfaces/customLLMProviderConfigSchemas";
import {
  assertLocalBedrockSeedEnvironment,
  seedLocalBedrockConnection,
} from "./local-bedrock";

vi.mock("node:fs", () => ({ existsSync: vi.fn(() => false) }));

const localEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "DEV",
};

beforeEach(() => vi.mocked(existsSync).mockReturnValue(false));

describe("local Bedrock seed guard", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "accepts a local DEV database at %s",
    (host) => {
      expect(() =>
        assertLocalBedrockSeedEnvironment({
          ...localEnvironment,
          DATABASE_URL: `postgresql://postgres@${host}/postgres?schema=public`,
        }),
      ).not.toThrow();
    },
  );

  it.each([
    { NODE_ENV: "production" },
    { CI: "true" },
    { CI: "false" },
    { GITHUB_ACTIONS: "true" },
    { KUBERNETES_SERVICE_HOST: "10.0.0.1" },
    { KUBERNETES_PORT: "tcp://10.0.0.1:443" },
    { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" },
    { DATABASE_URL: undefined },
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "postgresql://postgres@preview-postgres/postgres" },
    { DIRECT_URL: "postgresql://postgres@production.example/postgres" },
    { DIRECT_URL: "" },
    { DATABASE_URL: "postgresql://postgres@localhost.evil.example/postgres" },
    { DATABASE_URL: "https://localhost/postgres" },
    { DATABASE_URL: "postgresql://postgres@localhost/postgres?host=remote" },
    {
      DIRECT_URL: "postgresql://postgres@localhost/postgres?hostaddr=10.0.0.1",
    },
  ])(
    "rejects unsafe environment %j before any database access",
    async (overrides) => {
      const findUnique = vi.fn();
      const upsert = vi.fn();
      const prisma = {
        llmApiKeys: { findUnique, upsert },
      } as unknown as PrismaClient;
      await expect(
        seedLocalBedrockConnection(prisma, {
          ...localEnvironment,
          ...overrides,
        }),
      ).rejects.toThrow(/Local Bedrock seeding/);
      expect(findUnique).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it("rejects Kubernetes with a service account but no environment markers", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(() => assertLocalBedrockSeedEnvironment(localEnvironment)).toThrow(
      "Kubernetes",
    );
  });

  it("keeps database credentials out of validation errors", () => {
    expect(() =>
      assertLocalBedrockSeedEnvironment({
        ...localEnvironment,
        DATABASE_URL:
          "postgresql://secret-user:secret-password@remote/postgres",
      }),
    ).toThrow(
      "Local Bedrock seeding requires a loopback PostgreSQL DATABASE_URL without host overrides.",
    );
  });
});

describe("local Bedrock connection persistence", () => {
  it("encrypts the sentinel and preserves the connection and extra models on reruns", async () => {
    let stored: Record<string, unknown> | null = null;
    const findUnique = vi.fn(async () => stored);
    const upsert = vi.fn(async ({ create, update }) => {
      stored = stored
        ? { ...stored, ...update }
        : { id: "local-bedrock", ...create };
      return stored;
    });
    const prisma = {
      llmApiKeys: { findUnique, upsert },
    } as unknown as PrismaClient;
    const first = await seedLocalBedrockConnection(prisma, localEnvironment);
    const encrypted = upsert.mock.calls[0]![0].create.secretKey;
    expect(encrypted).not.toBe(BEDROCK_USE_DEFAULT_CREDENTIALS);
    expect(decrypt(encrypted)).toBe(BEDROCK_USE_DEFAULT_CREDENTIALS);
    stored = {
      ...upsert.mock.calls[0]![0].create,
      id: first.id,
      customModels: [...first.customModels, "extra-model"],
    };

    const second = await seedLocalBedrockConnection(prisma, localEnvironment);
    expect(second.id).toBe(first.id);
    expect(second.customModels).toEqual([...first.customModels, "extra-model"]);
    expect(upsert.mock.calls[1]![0].update).not.toHaveProperty("secretKey");
  });

  it.each([
    { secretKey: encrypt("a different credential") },
    { config: { region: "us-west-2" } },
    { adapter: "openai" },
  ])(
    "refuses to replace a different existing connection: %j",
    async (override) => {
      const upsert = vi.fn();
      const prisma = {
        llmApiKeys: {
          findUnique: vi.fn(async () => ({
            adapter: "bedrock",
            secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
            config: { region: "eu-west-1" },
            customModels: [],
            ...override,
          })),
          upsert,
        },
      } as unknown as PrismaClient;
      await expect(
        seedLocalBedrockConnection(prisma, localEnvironment),
      ).rejects.toThrow("Refusing to overwrite");
      expect(upsert).not.toHaveBeenCalled();
    },
  );
});
