import { afterEach, describe, expect, it, vi } from "vitest";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { type WebhookActionConfigWithSecrets } from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import EncryptLegacyWebhookHeaders from "../backgroundMigrations/encryptLegacyWebhookHeaders";

const createLegacyWebhookAction = async (projectId: string) =>
  prisma.action.create({
    data: {
      id: v4(),
      projectId,
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: "https://example.com/webhook",
        headers: { "x-api-key": "legacy-api-key" },
        apiVersion: { prompt: "v1" },
        secretKey: encrypt("whsec"),
        displaySecretKey: "lf-whsec_...",
      },
    },
  });

describe("EncryptLegacyWebhookHeaders", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts legacy headers without touching headers set in requestHeaders", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const encryptedAuth = encrypt("Bearer new-token");

    const legacyOnly = await prisma.action.create({
      data: {
        id: v4(),
        projectId,
        type: "WEBHOOK",
        config: {
          type: "WEBHOOK",
          url: "https://example.com/webhook",
          headers: { "x-api-key": "legacy-api-key" },
          apiVersion: { prompt: "v1" },
          secretKey: encrypt("whsec"),
          displaySecretKey: "lf-whsec_...",
        },
      },
    });

    const mixed = await prisma.action.create({
      data: {
        id: v4(),
        projectId,
        type: "WEBHOOK",
        config: {
          type: "WEBHOOK",
          url: "https://example.com/webhook",
          headers: {
            "X-Legacy": "legacy-value",
            Authorization: "Bearer stale-token",
          },
          requestHeaders: {
            Authorization: { secret: true, value: encryptedAuth },
          },
          displayHeaders: {
            "X-Legacy": { secret: false, value: "legacy-value" },
            Authorization: { secret: true, value: "Bear...oken" },
          },
          apiVersion: { prompt: "v1" },
          secretKey: encrypt("whsec"),
          displaySecretKey: "lf-whsec_...",
        },
      },
    });

    await new EncryptLegacyWebhookHeaders().run({});

    const legacyOnlyConfig = (
      await prisma.action.findUniqueOrThrow({ where: { id: legacyOnly.id } })
    ).config as WebhookActionConfigWithSecrets;
    expect(legacyOnlyConfig.headers).toEqual({});
    expect(legacyOnlyConfig.requestHeaders!["x-api-key"].secret).toBe(true);
    expect(decrypt(legacyOnlyConfig.requestHeaders!["x-api-key"].value)).toBe(
      "legacy-api-key",
    );
    expect(legacyOnlyConfig.displayHeaders).toEqual({
      "x-api-key": { secret: true, value: "lega...-key" },
    });

    const mixedConfig = (
      await prisma.action.findUniqueOrThrow({ where: { id: mixed.id } })
    ).config as WebhookActionConfigWithSecrets;
    expect(mixedConfig.headers).toEqual({});
    expect(mixedConfig.requestHeaders!.Authorization).toEqual({
      secret: true,
      value: encryptedAuth,
    });
    expect(decrypt(mixedConfig.requestHeaders!["X-Legacy"].value)).toBe(
      "legacy-value",
    );
    expect(mixedConfig.displayHeaders).toEqual({
      "X-Legacy": { secret: true, value: "lega...alue" },
      Authorization: { secret: true, value: "Bear...oken" },
    });

    // Re-running is a no-op.
    await new EncryptLegacyWebhookHeaders().run({});
    expect(
      (await prisma.action.findUniqueOrThrow({ where: { id: mixed.id } }))
        .config,
    ).toEqual(mixedConfig);
  });

  it("retries a row whose config changed concurrently", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const action = await createLegacyWebhookAction(projectId);

    const updateMany = prisma.action.updateMany.bind(prisma.action);
    vi.spyOn(prisma.action, "updateMany").mockImplementationOnce(
      async (args) => {
        // A concurrent writer, e.g. failure tracking, lands first.
        await prisma.$executeRaw`
          UPDATE actions
          SET config = jsonb_set(config, '{lastFailingExecutionId}', '"exec-1"')
          WHERE id = ${action.id}`;
        return updateMany(args);
      },
    );

    await new EncryptLegacyWebhookHeaders().run({});

    const config = (
      await prisma.action.findUniqueOrThrow({ where: { id: action.id } })
    ).config as WebhookActionConfigWithSecrets;
    expect(config.headers).toEqual({});
    expect(decrypt(config.requestHeaders!["x-api-key"].value)).toBe(
      "legacy-api-key",
    );
    expect(config.lastFailingExecutionId).toBe("exec-1");
  });

  it("fails the migration when a row cannot be encrypted", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const action = await createLegacyWebhookAction(projectId);

    vi.spyOn(prisma.action, "updateMany").mockRejectedValue(
      new Error("connection lost"),
    );

    await expect(new EncryptLegacyWebhookHeaders().run({})).rejects.toThrow(
      action.id,
    );
    const config = (
      await prisma.action.findUniqueOrThrow({ where: { id: action.id } })
    ).config as WebhookActionConfigWithSecrets;
    expect(config.headers).toEqual({ "x-api-key": "legacy-api-key" });
  });
});
