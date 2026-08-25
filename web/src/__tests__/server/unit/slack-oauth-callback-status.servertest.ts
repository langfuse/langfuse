import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const { mockInstallerHandleCallback, mockLogger } = vi.hoisted(() => ({
  mockInstallerHandleCallback: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  SlackService: {
    getInstance: () => ({
      getInstaller: () => ({ handleCallback: mockInstallerHandleCallback }),
    }),
  },
  SLACK_BOT_SCOPES: ["channels:read"],
  parseSlackInstallationMetadata: vi.fn(),
  logger: mockLogger,
  // Consumed by the shared vitest teardown (src/__tests__/teardown.ts).
  redis: null,
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_BASE_PATH: undefined,
  },
}));

vi.mock("@/src/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/src/features/audit-logs/auditLog", () => ({ auditLog: vi.fn() }));
vi.mock("@langfuse/shared/src/db", () => ({ prisma: {} }));

import { handleCallback } from "@/src/features/slack/server/oauth-handlers";

// Error codes produced by @slack/oauth's InstallProvider (dist/errors.d.ts).
const codedError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

const runCallbackWithFailure = async (error: Error) => {
  mockInstallerHandleCallback.mockImplementation(async (req, res, options) =>
    options.failure(error, undefined, req, res),
  );
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    url: "/api/public/slack/oauth?foo=bar",
  });
  await handleCallback(req, res);
  return res;
};

describe("slack oauth callback failure status mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      "slack_oauth_missing_code",
      "Redirect url is missing the required code query parameter",
    ],
    [
      "slack_oauth_missing_state",
      "Redirect url is missing the state query parameter",
    ],
    [
      "slack_oauth_invalid_state",
      "The state parameter is not for this browser session",
    ],
    [
      "slack_oauth_installer_authorization_error",
      "User cancelled the OAuth installation flow!",
    ],
  ])(
    "returns 400 and logs a warning for client-input error %s",
    async (code, message) => {
      const res = await runCallbackWithFailure(codedError(code, message));

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData()).toEqual({
        message: "Invalid OAuth callback parameters",
      });
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    // Token exchange failures surface as @slack/web-api platform errors.
    ["slack_webapi_platform_error", "Failed to exchange code"],
    ["slack_oauth_unknown_error", "Something unexpected happened"],
  ])("returns 500 and logs an error for %s", async (code, message) => {
    const res = await runCallbackWithFailure(codedError(code, message));

    expect(res.statusCode).toBe(500);
    expect(res._getJSONData()).toEqual({
      message: "Internal server error",
    });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });
});
