import type { Span } from "@opentelemetry/api";
import { InvalidRequestError } from "@langfuse/shared";
import { z } from "zod";
import type { ServerContext } from "@/src/features/mcp/types";

const { addUserToSpanMock, fakeSpan, instrumentAsyncMock } = vi.hoisted(() => {
  const fakeSpan = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
  };

  return {
    addUserToSpanMock: vi.fn(),
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
