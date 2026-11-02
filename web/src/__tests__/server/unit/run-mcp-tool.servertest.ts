import type { Span } from "@opentelemetry/api";
import { InvalidRequestError } from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { formatErrorForUser } from "@/src/features/mcp/core/error-formatting";
import { z } from "zod";
import type { ServerContext } from "@/src/features/mcp/types";
import type { Redis } from "ioredis";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { handleListObservations } from "@/src/features/mcp/server/observations/tools/listObservations";

const { addUserToSpanMock, fakeSpan, instrumentAsyncMock, queryMock } =
  vi.hoisted(() => {
    const fakeSpan = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
    };

    return {
      addUserToSpanMock: vi.fn(),
      queryMock: vi.fn(),
      fakeSpan,
      instrumentAsyncMock: vi.fn(async (_options, callback) =>
        callback(fakeSpan),
      ),
    };
  });

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal()),
  addUserToSpan: addUserToSpanMock,
  instrumentAsync: instrumentAsyncMock,
  getObservationsV2FromEventsTableForPublicApi: queryMock,
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us",
    LANGFUSE_RATE_LIMITS_ENABLED: "true",
  },
}));

import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const context: ServerContext = {
  projectId: "project-id",
  orgId: "org-id",
  apiKeyId: "api-key-id",
  accessLevel: "project",
  publicKey: "pk-lf-test",
  plan: "oss",
  rateLimitOverrides: [],
};

describe("runMcpTool outcome telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["TIMEOUT", "MEMORY_LIMIT", "OVERCOMMIT"] as const)(
    "classifies handled ClickHouse %s errors consistently with the response",
    async (errorType) => {
      const error = new ClickHouseResourceError(
        errorType,
        new Error("sensitive ClickHouse details"),
      );

      await expect(
        runMcpTool({
          spanName: "mcp.test",
          context,
          fn: async () => {
            throw error;
          },
        }),
      ).rejects.toBe(error);

      expect(fakeSpan.setAttribute).toHaveBeenCalledWith(
        "mcp.outcome",
        "request_error",
      );
      const response = formatErrorForUser(error);
      expect(response.code).toBe(ErrorCode.InvalidRequest);
      expect(response.message).toMatch(/date range/);
      expect(response.message).not.toContain("sensitive ClickHouse details");
    },
  );

  it.each([
    {
      name: "successful execution",
      execute: async () => "ok",
      expectedOutcome: "success",
    },
    {
      name: "actionable request error",
      execute: async () => {
        throw new InvalidRequestError("invalid input");
      },
      expectedOutcome: "request_error",
    },
    {
      name: "in-handler schema validation error",
      execute: async () => z.string().parse(42),
      expectedOutcome: "request_error",
    },
    {
      name: "unexpected server error",
      execute: async () => {
        throw new Error("database unavailable");
      },
      expectedOutcome: "server_error",
    },
  ])(
    "records a bounded outcome for $name",
    async ({ execute, expectedOutcome }) => {
      await runMcpTool({
        spanName: "mcp.test",
        context,
        fn: execute as (span: Span) => Promise<string>,
      }).catch(() => undefined);

      expect(fakeSpan.setAttribute).toHaveBeenCalledWith(
        "mcp.outcome",
        expectedOutcome,
      );
    },
  );
});

describe("MCP observation search cooldown", () => {
  const input = {
    fromStartTime: "2026-10-01T00:00:00Z",
    toStartTime: "2026-10-02T00:00:00Z",
    limit: 10,
  };
  const cooldowns = new Map<string, number>();
  const redis = {
    status: "wait",
    connect: vi.fn(async () => {
      redis.status = "ready";
    }),
    ttl: vi.fn(async (key: string) => cooldowns.get(key) ?? -2),
    set: vi.fn(
      async (key: string, _value: string, _ex: string, seconds: number) => {
        cooldowns.set(key, seconds);
        return "OK";
      },
    ),
    disconnect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cooldowns.clear();
    redis.status = "wait";
    queryMock.mockReset().mockResolvedValue([]);
    RateLimitService.shutdown();
    RateLimitService.getInstance(redis as unknown as Redis);
  });

  afterEach(() => RateLimitService.shutdown());

  it.each(["TIMEOUT", "MEMORY_LIMIT", "OVERCOMMIT"] as const)(
    "backs off after %s, isolates projects, and resumes after expiry",
    async (errorType) => {
      await expect(
        handleListObservations(input, context),
      ).resolves.toBeDefined();
      queryMock.mockRejectedValueOnce(
        new ClickHouseResourceError(
          errorType,
          new Error("private query details"),
        ),
      );
      await expect(
        handleListObservations(input, context),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
      });

      await expect(handleListObservations(input, context)).rejects.toThrow(
        /retry in 30s/i,
      );
      expect(queryMock).toHaveBeenCalledTimes(2);
      expect(redis.set).toHaveBeenCalledWith(
        "rate-limit:mcp-query-cooldown:project-id",
        "1",
        "EX",
        30,
      );
      await expect(
        handleListObservations(input, {
          ...context,
          projectId: "other-project",
        }),
      ).resolves.toBeDefined();

      // Redis TTL 0 still means the key exists for less than a second.
      cooldowns.set("rate-limit:mcp-query-cooldown:project-id", 0);
      await expect(handleListObservations(input, context)).rejects.toThrow(
        /retry in 1s/i,
      );
      expect(redis.set).toHaveBeenCalledTimes(1);
      cooldowns.clear();
      await expect(
        handleListObservations(input, context),
      ).resolves.toBeDefined();
      expect(queryMock).toHaveBeenCalledTimes(4);
    },
  );

  it("fails open on Redis errors and preserves normal query error handling", async () => {
    redis.ttl.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(handleListObservations(input, context)).resolves.toBeDefined();

    redis.set.mockRejectedValueOnce(new Error("Redis unavailable"));
    queryMock.mockRejectedValueOnce(
      new ClickHouseResourceError(
        "TIMEOUT",
        new Error("private query details"),
      ),
    );
    await expect(handleListObservations(input, context)).rejects.toThrow(
      /query timed out/i,
    );
    await expect(handleListObservations(input, context)).resolves.toBeDefined();

    redis.set.mockClear();
    queryMock.mockRejectedValueOnce(new InvalidRequestError("invalid filter"));
    await expect(handleListObservations(input, context)).rejects.toThrow(
      "invalid filter",
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
});
