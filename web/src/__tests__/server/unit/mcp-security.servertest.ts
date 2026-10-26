const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_MCP_ALLOWED_HOSTS: [] as string[],
    NEXTAUTH_URL: "https://langfuse.example.com",
    NODE_ENV: "production",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import type { NextApiRequest, NextApiResponse } from "next";
import { PayloadTooLargeError } from "@langfuse/shared";
import { validateMcpRequestSecurity } from "@/src/features/mcp/server/security";

const mockRequest = (
  headers: NextApiRequest["headers"],
  body?: unknown,
): NextApiRequest => ({ headers, body }) as NextApiRequest;
const mockResponse = { setHeader: vi.fn() } as unknown as NextApiResponse;

describe("MCP request security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.env.NEXTAUTH_URL = "https://langfuse.example.com";
    mockEnv.env.NODE_ENV = "production";
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = [];
  });

  it("allows an exact additional host from LANGFUSE_MCP_ALLOWED_HOSTS", () => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = ["internal-langfuse.example.com"];

    expect(
      validateMcpRequestSecurity(
        mockRequest({
          host: "internal-langfuse.example.com",
          origin: "https://internal-langfuse.example.com",
        }),
        mockResponse,
      ),
    ).toBe("https://internal-langfuse.example.com");
  });

  it("rejects hosts that are not configured exactly", () => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = [
      "*.example.com",
      "internal-langfuse.example.com/api",
    ];

    expect(() =>
      validateMcpRequestSecurity(
        mockRequest({ host: "evil.example.com" }),
        mockResponse,
      ),
    ).toThrow("Invalid Host header: evil.example.com");
  });

  it("disables host and origin validation when LANGFUSE_MCP_ALLOWED_HOSTS is *", () => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = ["*"];

    expect(
      validateMcpRequestSecurity(
        mockRequest({
          host: "any-host.example.com",
          origin: "https://any-origin.example.com",
        }),
        mockResponse,
      ),
    ).toBe("https://any-origin.example.com");
  });

  it.each([
    [
      "unknown object members",
      () =>
        Object.fromEntries(Array.from({ length: 50_001 }, (_, i) => [i, null])),
    ],
    [
      "nested array elements",
      () => ({ params: { arguments: [Array(50_000).fill(null)] } }),
    ],
    [
      "metadata aggregated across a batch",
      () => [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: Array(25_000).fill(null) },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: { _meta: Array(25_000).fill(null) },
        },
      ],
    ],
    [
      "deeply nested input",
      () => {
        let body: unknown = null;
        for (let i = 0; i < 50_001; i++) body = [body];
        return body;
      },
    ],
  ])("rejects excessive %s even with wildcard hosts", (_, createBody) => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = ["*"];

    expect(() =>
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, createBody()),
        mockResponse,
      ),
    ).toThrow(PayloadTooLargeError);
  });

  it("allows the element budget boundary and large prompt strings", () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "prompts.create",
        arguments: { prompt: "x".repeat(4 * 1024 * 1024) },
      },
    };

    expect(
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, body),
        mockResponse,
      ),
    ).toBeNull();
    expect(
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, Array(50_000).fill(null)),
        mockResponse,
      ),
    ).toBeNull();
    expect(() =>
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, Array(50_001).fill(null)),
        mockResponse,
      ),
    ).toThrow(PayloadTooLargeError);
  });

  it("allows a full dataset batch with structured chat inputs", () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "batchUpsertDatasetItems",
        arguments: {
          datasetId: "test-dataset",
          items: Array.from({ length: 100 }, () => ({
            input: Array.from({ length: 100 }, () => ({
              role: "user",
              content: "test message",
            })),
            expectedOutput: { role: "assistant", content: "test answer" },
            metadata: { source: "chat", tags: ["test"] },
          })),
        },
      },
    };

    expect(
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, body),
        mockResponse,
      ),
    ).toBeNull();
  });

  it("keeps CORS headers and recovery guidance on body-limit errors", () => {
    expect(() =>
      validateMcpRequestSecurity(
        mockRequest(
          {
            host: "langfuse.example.com",
            origin: "https://langfuse.example.com",
          },
          Array(50_001).fill(null),
        ),
        mockResponse,
      ),
    ).toThrow(
      expect.objectContaining({
        httpCode: 422,
        message: expect.stringContaining("Split batches into smaller requests"),
      }) as Error,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "https://langfuse.example.com",
    );
  });
});
