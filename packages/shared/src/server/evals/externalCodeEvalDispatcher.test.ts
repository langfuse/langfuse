import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateWebhookSignature } from "../../encryption/signature";
import {
  CODE_EVAL_DISPATCH_RESULT_MAX_BYTES,
  type DispatchInput,
} from "./codeEvalDispatcherTypes";
import { ExternalCodeEvalDispatcher } from "./externalCodeEvalDispatcher";

vi.mock("../instrumentation", () => ({
  instrumentAsync: vi.fn(async (_ctx, callback) =>
    callback({ setAttribute: vi.fn(), setAttributes: vi.fn() }),
  ),
  recordDistribution: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
}));

const SIGNING_SECRET = "test-signing-secret-with-32-characters";
const SCORES = [{ name: "accuracy", value: 1, dataType: "NUMERIC" }];

const input: DispatchInput = {
  scope: {
    organizationId: "org-1",
    projectId: "project-1",
    evaluatorId: "evaluator-1",
  },
  runtime: { language: "PYTHON" },
  execution: { jobExecutionId: "job-1" },
  code: { source: "def evaluate(): pass" },
  payload: {
    observation: { input: null, output: null, metadata: null, toolCalls: [] },
  },
};

type Reply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

let server: Server;
let endpoint: string;
let requests: { headers: IncomingMessage["headers"]; body: string }[];
let replies: (Reply | "hang" | "oversized")[];

beforeEach(async () => {
  requests = [];
  replies = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ headers: req.headers, body });
      const reply = replies.shift() ?? { status: 500 };
      if (reply === "hang") return;
      if (reply === "oversized") {
        res.writeHead(200, { "content-type": "application/json" });
        res.write(
          `{"scores":[],"padding":"${"x".repeat(CODE_EVAL_DISPATCH_RESULT_MAX_BYTES)}`,
        );
        res.end('"}');
        return;
      }
      res.writeHead(reply.status, {
        "content-type": "application/json",
        ...reply.headers,
      });
      res.end(reply.body === undefined ? "" : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/evaluate`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

function createDispatcher(timeoutMs = 2_000) {
  return new ExternalCodeEvalDispatcher({
    endpoint,
    signingSecret: SIGNING_SECRET,
    headers: { Authorization: "Bearer executor-token" },
    timeoutMs,
    connectTimeoutMs: 1_000,
    maxAttempts: 3,
    languages: ["PYTHON"],
  });
}

describe("ExternalCodeEvalDispatcher", () => {
  it("sends a signed v1 request and returns the executor's scores", async () => {
    replies.push({ status: 200, body: { scores: SCORES } });

    await expect(createDispatcher().dispatch(input)).resolves.toEqual({
      scores: SCORES,
    });

    const [request] = requests;
    expect(JSON.parse(request.body)).toEqual({ apiVersion: "v1", ...input });
    expect(request.headers.authorization).toBe("Bearer executor-token");
    const [, timestamp, signature] =
      /^t=(\d+),v1=([0-9a-f]+)$/.exec(
        String(request.headers["x-langfuse-signature"]),
      ) ?? [];
    expect(signature).toBe(
      generateWebhookSignature(request.body, Number(timestamp), SIGNING_SECRET),
    );
  });

  it("keeps valid scores when the executor also returns an error envelope", async () => {
    replies.push({
      status: 200,
      body: { scores: SCORES, error: { code: "TIMEOUT", message: "late" } },
    });

    await expect(createDispatcher().dispatch(input)).resolves.toEqual({
      scores: SCORES,
    });
  });

  it("surfaces user-code errors from a 422 envelope without retrying", async () => {
    replies.push({
      status: 422,
      body: { error: { code: "TIMEOUT", message: "Evaluator timed out" } },
    });

    await expect(createDispatcher().dispatch(input)).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: false,
    });
    expect(requests).toHaveLength(1);
  });

  it("treats a 2xx body that is not JSON as an executor fault, not a user error", async () => {
    replies.push({ status: 200 });

    await expect(createDispatcher().dispatch(input)).rejects.toMatchObject({
      code: "EXTERNAL_CONFIGURATION_ERROR",
    });
  });

  it("rejects languages the executor is not configured for without sending", async () => {
    await expect(
      createDispatcher().dispatch({
        ...input,
        runtime: { language: "TYPESCRIPT" },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_RUNTIME" });
    expect(requests).toHaveLength(0);
  });

  it("retries transient failures before succeeding", async () => {
    replies.push({ status: 503 }, { status: 200, body: { scores: SCORES } });

    await expect(createDispatcher().dispatch(input)).resolves.toEqual({
      scores: SCORES,
    });
    expect(requests).toHaveLength(2);
  });

  it.each([
    {
      reply: { status: 400 },
      code: "EXTERNAL_CONFIGURATION_ERROR",
      attempts: 1,
    },
    {
      reply: { status: 302, headers: { location: "http://169.254.169.254/" } },
      code: "EXTERNAL_CONFIGURATION_ERROR",
      attempts: 1,
    },
    {
      reply: { status: 302 },
      code: "EXTERNAL_CONFIGURATION_ERROR",
      attempts: 1,
    },
    {
      reply: { status: 307, headers: { location: "http://[" } },
      code: "EXTERNAL_CONFIGURATION_ERROR",
      attempts: 1,
    },
    { reply: { status: 413 }, code: "PAYLOAD_TOO_LARGE", attempts: 1 },
    { reply: { status: 503 }, code: "EXTERNAL_INVOCATION_ERROR", attempts: 3 },
  ])(
    "maps HTTP $reply.status to $code after $attempts attempt(s)",
    async ({ reply, code, attempts }) => {
      replies.push(reply, reply, reply);

      await expect(createDispatcher().dispatch(input)).rejects.toMatchObject({
        code,
      });
      expect(requests).toHaveLength(attempts);
    },
  );

  it("treats a slow executor as a retryable infrastructure error, not a user timeout", async () => {
    replies.push("hang", "hang", "hang");

    await expect(createDispatcher(200).dispatch(input)).rejects.toMatchObject({
      code: "EXTERNAL_INVOCATION_ERROR",
      retryable: true,
    });
  });

  it("keeps header values out of errors when a configured header is invalid", async () => {
    const dispatcher = new ExternalCodeEvalDispatcher({
      endpoint,
      signingSecret: SIGNING_SECRET,
      headers: { Authorization: "Bearer executor-token\nInjected: 1" },
      timeoutMs: 2_000,
      connectTimeoutMs: 1_000,
      maxAttempts: 1,
      languages: ["PYTHON"],
    });

    const error = await dispatcher.dispatch(input).catch((error) => error);

    expect(error).toMatchObject({ code: "EXTERNAL_INVOCATION_ERROR" });
    expect(String(error.message)).not.toContain("executor-token");
  });

  it("dispatches to an endpoint that startup accepted with surrounding Unicode whitespace", async () => {
    replies.push({ status: 200, body: { scores: SCORES } });
    endpoint = `\u00a0${endpoint}`;

    await expect(createDispatcher().dispatch(input)).resolves.toEqual({
      scores: SCORES,
    });
  });

  it("stops reading responses beyond the result size limit", async () => {
    replies.push("oversized");

    await expect(createDispatcher().dispatch(input)).rejects.toMatchObject({
      code: "RESULT_TOO_LARGE",
    });
  });
});
