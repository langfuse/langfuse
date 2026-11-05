import { vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { env } from "@/src/env.mjs";
import type * as SharedServer from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import {
  createOrgProjectAndApiKey,
  dispatchProjectNotification,
} from "@langfuse/shared/src/server";
import handler from "../../pages/api/admin/projects/[projectId]/blob-storage-integration/disable";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return { ...actual, dispatchProjectNotification: vi.fn() };
});

const ADMIN_API_KEY = "test-admin-api-key";
const REASON =
  "Your bucket rejects our uploads with 403. Please fix the policy.";

const callDisable = async ({
  projectId,
  body,
  auth = `Bearer ${ADMIN_API_KEY}`,
  method = "POST",
}: {
  projectId: string;
  body?: Record<string, unknown>;
  auth?: string;
  method?: "POST" | "GET";
}) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    headers: { authorization: auth },
    query: { projectId },
    body,
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() };
};

const createIntegration = (projectId: string, enabled = true) =>
  prisma.blobStorageIntegration.create({
    data: {
      projectId,
      type: "S3",
      bucketName: "customer-bucket",
      prefix: "",
      accessKeyId: "key",
      secretAccessKey: encrypt("secret"),
      region: "us-east-1",
      forcePathStyle: false,
      enabled,
      exportFrequency: "hourly",
    },
  });

describe("POST /api/admin/projects/[projectId]/blob-storage-integration/disable", () => {
  const originalAdminApiKey = env.ADMIN_API_KEY;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeAll(() => {
    (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
  });

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    vi.mocked(dispatchProjectNotification).mockReset();
  });

  afterAll(() => {
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("disables the export, stores the reason, and notifies the project", async () => {
    const { projectId, project } = await createOrgProjectAndApiKey();
    await createIntegration(projectId);

    const { status, body } = await callDisable({
      projectId,
      body: { reason: `  ${REASON}  ` },
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      projectId,
      enabled: false,
      lastError: REASON,
      notificationSent: true,
    });
    const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
      where: { projectId },
    });
    expect(row.enabled).toBe(false);
    expect(row.lastError).toBe(REASON);
    expect(row.lastErrorAt).not.toBeNull();
    expect(dispatchProjectNotification).toHaveBeenCalledWith({
      projectId,
      event: expect.objectContaining({
        eventType: "blob-export-failed",
        projectName: project.name,
        resourceName: "customer-bucket",
        disabled: true,
        reason: REASON,
        message: expect.stringContaining(REASON),
      }),
    });
  });

  it("is available on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    const { projectId } = await createOrgProjectAndApiKey();
    await createIntegration(projectId);

    const { status } = await callDisable({
      projectId,
      body: { reason: REASON },
    });

    expect(status).toBe(200);
  });

  it("keeps the export disabled when the notification fails", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createIntegration(projectId);
    vi.mocked(dispatchProjectNotification).mockRejectedValueOnce(
      new Error("smtp down"),
    );

    const { status, body } = await callDisable({
      projectId,
      body: { reason: REASON },
    });

    expect(status).toBe(200);
    expect(body.notificationSent).toBe(false);
    const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
      where: { projectId },
    });
    expect(row.enabled).toBe(false);
    expect(row.lastError).toBe(REASON);
  });

  it("returns 409 without notifying when the export is already disabled", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createIntegration(projectId, false);

    const { status } = await callDisable({
      projectId,
      body: { reason: REASON },
    });

    expect(status).toBe(409);
    expect(dispatchProjectNotification).not.toHaveBeenCalled();
    const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
      where: { projectId },
    });
    expect(row.lastError).toBeNull();
  });

  it("returns 404 when the project has no blob storage integration", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const { status } = await callDisable({
      projectId,
      body: { reason: REASON },
    });

    expect(status).toBe(404);
  });

  it("rejects a missing or blank reason", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createIntegration(projectId);

    expect((await callDisable({ projectId, body: {} })).status).toBe(400);
    expect(
      (await callDisable({ projectId, body: { reason: "   " } })).status,
    ).toBe(400);
    const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
      where: { projectId },
    });
    expect(row.enabled).toBe(true);
  });

  it("rejects requests without the admin API key", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    await createIntegration(projectId);

    const { status } = await callDisable({
      projectId,
      body: { reason: REASON },
      auth: "Bearer wrong-key",
    });

    expect(status).toBe(401);
    const row = await prisma.blobStorageIntegration.findUniqueOrThrow({
      where: { projectId },
    });
    expect(row.enabled).toBe(true);
  });

  it("rejects non-POST methods", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const { status } = await callDisable({ projectId, method: "GET" });

    expect(status).toBe(405);
  });
});
