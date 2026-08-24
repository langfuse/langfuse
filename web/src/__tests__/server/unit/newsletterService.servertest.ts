const { envMock } = vi.hoisted(() => ({
  envMock: {} as Record<string, unknown>,
}));

vi.mock("@/src/env.mjs", () => ({
  env: envMock,
}));

import { logger } from "@langfuse/shared/src/server";
import {
  isNewsletterSignupAvailable,
  subscribeToNewsletter,
} from "@/src/features/onboarding/server/newsletterService";

const setEnv = (values: Record<string, unknown>) => {
  for (const key of Object.keys(envMock)) delete envMock[key];
  Object.assign(envMock, values);
};

describe("newsletterService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // Spied rather than module-mocked: the shared test teardown imports this same
  // logger, so replacing the module would break it.
  let loggerMock: {
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    setEnv({});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    loggerMock = {
      info: vi.spyOn(logger, "info").mockReturnValue(logger),
      warn: vi.spyOn(logger, "warn").mockReturnValue(logger),
      error: vi.spyOn(logger, "error").mockReturnValue(logger),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("isNewsletterSignupAvailable", () => {
    it("offers the in-product signup on a plain self-hosted instance", () => {
      setEnv({});
      expect(isNewsletterSignupAvailable()).toBe(true);
    });

    it("does not offer it on Langfuse Cloud", () => {
      setEnv({ NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" });
      expect(isNewsletterSignupAvailable()).toBe(false);
    });

    it("honors an operator who disabled the telemetry ping", () => {
      setEnv({ TELEMETRY_ENABLED: "false" });
      expect(isNewsletterSignupAvailable()).toBe(false);
    });
  });

  describe("subscribeToNewsletter", () => {
    it("posts the email to the langfuse.com signup proxy for the oss list", async () => {
      fetchMock.mockResolvedValue({ ok: true });

      await expect(
        subscribeToNewsletter({ email: "user@example.com" }),
      ).resolves.toBe("subscribed");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://langfuse.com/api/productUpdateSignup");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        email: "user@example.com",
        list: "oss",
        source: "self-host-onboarding",
      });
      // Must not hang the onboarding step on an unreachable network.
      expect(init.signal).toBeDefined();
    });

    it("reports unavailable without a request when signup is turned off", async () => {
      setEnv({ TELEMETRY_ENABLED: "false" });

      await expect(
        subscribeToNewsletter({ email: "user@example.com" }),
      ).resolves.toBe("unavailable");

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports unavailable when the instance cannot reach langfuse.com", async () => {
      // The airgapped case: no route out, so the fetch rejects.
      fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

      await expect(
        subscribeToNewsletter({ email: "user@example.com" }),
      ).resolves.toBe("unavailable");

      // Expected for airgapped deployments, so it must not report as an error.
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalled();
    });

    it("reports unavailable when the proxy rejects the request", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      await expect(
        subscribeToNewsletter({ email: "user@example.com" }),
      ).resolves.toBe("unavailable");

      expect(loggerMock.warn).toHaveBeenCalled();
    });
  });
});
