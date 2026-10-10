const { env } = vi.hoisted(() => ({
  env: {
    TURNSTILE_SECRET: undefined as string | undefined,
    TURNSTILE_HOSTNAMES: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

import { TURNSTILE_ACTIONS } from "@/src/features/auth/constants";
import {
  getTurnstileRemoteIp,
  verifyTurnstileToken,
} from "@/src/features/auth/server/verifyTurnstile";

const fetchMock = vi.fn();

function siteverifyReturns(body: Record<string, unknown>, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

const verifyLogin = (token: unknown) =>
  verifyTurnstileToken({
    token,
    action: TURNSTILE_ACTIONS.login,
    remoteIp: "203.0.113.7",
  });

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    env.TURNSTILE_SECRET = "test-secret";
    env.TURNSTILE_HOSTNAMES = "cloud.langfuse.com, us.cloud.langfuse.com";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the check when no secret is configured", async () => {
    env.TURNSTILE_SECRET = undefined;

    await expect(verifyLogin(undefined)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a token with the expected action and an allowed hostname", async () => {
    siteverifyReturns({
      success: true,
      action: "login",
      hostname: "us.cloud.langfuse.com",
    });

    await expect(verifyLogin("token-from-widget")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("token-from-widget");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it.each([
    [
      "siteverify rejects the token",
      { success: false, action: "login", hostname: "cloud.langfuse.com" },
    ],
    [
      "the action belongs to another surface",
      { success: true, action: "signup", hostname: "cloud.langfuse.com" },
    ],
    [
      "the hostname is not allowlisted",
      { success: true, action: "login", hostname: "evil.example.com" },
    ],
    ["the hostname is missing", { success: true, action: "login" }],
  ])("rejects when %s", async (_case, response) => {
    siteverifyReturns(response);

    await expect(verifyLogin("token-from-widget")).resolves.toBe(false);
  });

  it("rejects without calling siteverify when the token is missing or too long", async () => {
    await expect(verifyLogin(undefined)).resolves.toBe(false);
    await expect(verifyLogin("")).resolves.toBe(false);
    await expect(verifyLogin("x".repeat(2049))).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the hostname allowlist is empty", async () => {
    env.TURNSTILE_HOSTNAMES = " , ";

    await expect(verifyLogin("token-from-widget")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when siteverify is unreachable or errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(verifyLogin("token-from-widget")).resolves.toBe(false);

    siteverifyReturns({ success: true }, 500);
    await expect(verifyLogin("token-from-widget")).resolves.toBe(false);
  });
});

describe("getTurnstileRemoteIp", () => {
  it("uses the first x-forwarded-for hop", () => {
    expect(
      getTurnstileRemoteIp({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
    ).toBe("203.0.113.7");
    expect(getTurnstileRemoteIp({})).toBeUndefined();
    expect(getTurnstileRemoteIp(undefined)).toBeUndefined();
  });
});
