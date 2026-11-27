import { afterEach, describe, expect, it, vi } from "vitest";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { type WebhookActionConfigWithSecrets } from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import EncryptLegacyWebhookHeaders from "../backgroundMigrations/encryptLegacyWebhookHeaders";

const createLegacyWebhookAction = async (
  projectId: string,
  headerConfig: Partial<WebhookActionConfigWithSecrets> = {
    headers: { "x-api-key": "legacy-api-key" },
  },
) =>
  prisma.action.create({
    data: {
      id: v4(),
      projectId,
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: "https://example.com/webhook",
        apiVersion: { prompt: "v1" },
        secretKey: encrypt("whsec"),
        displaySecretKey: "lf-whsec_...",
        ...headerConfig,
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
    const action = await createLegacyWebhookAction(projectId, {
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
    });

    await new EncryptLegacyWebhookHeaders().run({});

    const config = (
      await prisma.action.findUniqueOrThrow({ where: { id: action.id } })
    ).config as WebhookActionConfigWithSecrets;
    expect(config.headers).toEqual({});
    expect(config.requestHeaders!.Authorization).toEqual({
      secret: true,
      value: encryptedAuth,
    });
    expect(config.requestHeaders!["X-Legacy"].secret).toBe(true);
    expect(decrypt(config.requestHeaders!["X-Legacy"].value)).toBe(
      "legacy-value",
    );
    expect(config.displayHeaders).toEqual({
      "X-Legacy": { secret: true, value: "lega...alue" },
      Authorization: { secret: true, value: "Bear...oken" },
    });

    // Re-running is a no-op.
    await new EncryptLegacyWebhookHeaders().run({});
    expect(
      (await prisma.action.findUniqueOrThrow({ where: { id: action.id } }))
        .config,
    ).toEqual(config);
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
