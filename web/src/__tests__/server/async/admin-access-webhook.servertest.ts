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
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = originalWebhook;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
  });

  it("should not send when webhook is not configured", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = undefined;
    const fetchSpy = vi
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
    const fetchSpy = vi
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "HIPAA";

    const fetchSpy = vi
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
      signal: expect.any(AbortSignal),
    });
  });

  it("should dedupe repeated sends within 24 hours for same email/project/org", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    vi.setSystemTime(new Date("2026-02-20T19:39:38.000Z"));

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should not dedupe when email/project/org differ", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
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

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

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

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
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

  it("should retry on a later event after a non-ok response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    vi.setSystemTime(new Date("2026-02-19T19:40:38.000Z"));

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    // A failed delivery must not consume the 24h dedupe window.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should retry on a later event after fetch rejects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true } as Response);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    vi.setSystemTime(new Date("2026-02-19T19:40:38.000Z"));

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should still dedupe a successful delivery within the window", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
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

  it("should abort a hung endpoint instead of awaiting it indefinitely", async () => {
    vi.useFakeTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    // Never settles on its own — only the abort signal can end it.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () =>
            reject(signal.reason ?? new Error("aborted")),
          );
        }),
    );

    const pending = sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBeUndefined();
  });

  it("should not retry again until the failure cooldown has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

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

    // An unreachable endpoint must not put a delivery attempt — and its
    // timeout — on every admin request that follows.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-02-19T19:40:38.000Z"));

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("should collapse concurrent callers onto a single delivery", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    let resolveDelivery: (response: Response) => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveDelivery = resolve;
        }),
    );

    const first = sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });
    const second = sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    await second;
    resolveDelivery({ ok: true } as Response);
    await first;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should retry after a hung endpoint times out", async () => {
    vi.useFakeTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = (init as RequestInit | undefined)?.signal;
            signal?.addEventListener("abort", () =>
              reject(signal.reason ?? new Error("aborted")),
            );
          }),
      )
      .mockResolvedValueOnce({ ok: true } as Response);

    const pending = sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    await vi.advanceTimersByTimeAsync(60_001);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
