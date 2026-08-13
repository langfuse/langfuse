import { type Mock } from "vitest";
import { env } from "@/src/env.mjs";
import {
  fetchWithSecureRedirects,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import {
  resetAdminAccessWebhookCacheForTests,
  sendAdminAccessWebhook,
} from "@/src/server/adminAccessWebhook";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");

  return {
    ...actual,
    fetchWithSecureRedirects: vi.fn(),
    validateWebhookURL: vi.fn(),
  };
});

const okResult = {
  response: { ok: true } as Response,
  redirectChain: [],
  finalUrl: "https://example.com/hook",
};

describe("sendAdminAccessWebhook", () => {
  const originalWebhook = env.LANGFUSE_ADMIN_ACCESS_WEBHOOK;
  const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const fetchMock = fetchWithSecureRedirects as Mock;
  const validateMock = validateWebhookURL as Mock;

  beforeEach(() => {
    resetAdminAccessWebhookCacheForTests();
    fetchMock.mockReset();
    validateMock.mockReset();
    validateMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = originalWebhook;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
  });

  it("should not send when webhook is not configured", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = undefined;
    fetchMock.mockResolvedValue(okResult);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should not send when email is missing", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    fetchMock.mockResolvedValue(okResult);

    await sendAdminAccessWebhook({
      email: null,
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should send expected payload including project, org and region", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "HIPAA";

    fetchMock.mockResolvedValue(okResult);

    await sendAdminAccessWebhook({
      email: "admin@langfuse.com",
      projectId: "project-1",
      orgId: "org-1",
    });

    expect(validateMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.any(Object),
      { allowedPorts: "any" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      {
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
      },
      {
        maxRedirects: 10,
        redirectValidation: {
          validateUrl: expect.any(Function),
          whitelist: expect.any(Object),
          logContext: "Admin access webhook",
        },
      },
    );
  });

  it("should dedupe repeated sends within 24 hours for same email/project/org", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    fetchMock.mockResolvedValue(okResult);

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

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should send again after dedupe window has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T19:39:37.000Z"));
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    fetchMock.mockResolvedValue(okResult);

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

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should not dedupe when email/project/org differ", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    fetchMock.mockResolvedValue(okResult);

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

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should collapse concurrent callers onto a single delivery", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    let resolveDelivery: (result: typeof okResult) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<typeof okResult>((resolve) => {
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
    resolveDelivery(okResult);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should not throw when the request rejects", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    fetchMock.mockRejectedValue(new Error("network error"));

    await expect(
      sendAdminAccessWebhook({
        email: "admin@langfuse.com",
        projectId: "project-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("should not throw when the endpoint returns a non-ok response", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    fetchMock.mockResolvedValue({
      ...okResult,
      response: {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response,
    });

    await expect(
      sendAdminAccessWebhook({
        email: "admin@langfuse.com",
        projectId: "project-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();
  });

  it("should not send and not throw when URL validation rejects", async () => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://10.0.0.1/hook";

    validateMock.mockRejectedValue(new Error("Blocked IP address detected"));
    fetchMock.mockResolvedValue(okResult);

    await expect(
      sendAdminAccessWebhook({
        email: "admin@langfuse.com",
        projectId: "project-1",
        orgId: "org-1",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should abort a hung endpoint instead of awaiting it indefinitely", async () => {
    vi.useFakeTimers();
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";

    // Never settles on its own — only the abort signal can end it.
    fetchMock.mockImplementation(
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
});
