import { env } from "@/src/env.mjs";
import {
  resetAdminAccessWebhookCacheForTests,
  sendAdminAccessWebhook,
} from "@/src/server/adminAccessWebhook";

describe("sendAdminAccessWebhook", () => {
  const originalWebhook = env.LANGFUSE_ADMIN_ACCESS_WEBHOOK;
  const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    resetAdminAccessWebhookCacheForTests();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = originalWebhook;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
  });

  it("should not send when webhook is not configured", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = undefined;
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should not send when email is missing", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: null,
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should send expected payload including project, org and region", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "HIPAA";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/hook", {
      method: "POST",
      body: JSON.stringify({
        email: "admin@langfuse.com",
        timestamp: "2026-02-19T19:39:37.000Z",
        project: "project-1",
        org: "org-1",
        region: "HIPAA",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  it("should dedupe repeated sends within 60 seconds for same email/project/org", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });
    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should send again after dedupe window has passed", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    jest.setSystemTime(new Date("2026-02-19T19:40:38.000Z"));

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should not dedupe when email/project/org differ", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });
    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-2",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should not throw when fetch rejects", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    await expect(
      sendAdminAccessWebhook({
        email: "admin@langfuse.com",
        projectId: "project-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("should not throw when fetch returns non-ok response", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(
      sendAdminAccessWebhook({
        email: "admin@langfuse.com",
        projectId: "project-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();
  });
});
