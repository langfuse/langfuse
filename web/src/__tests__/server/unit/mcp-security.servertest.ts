const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_MCP_ALLOWED_HOSTS: [] as string[],
    NEXTAUTH_URL: "https://langfuse.example.com",
    NODE_ENV: "production",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import type { NextApiRequest } from "next";
import { PayloadTooLargeError } from "@langfuse/shared";
import { validateMcpRequestSecurity } from "@/src/features/mcp/server/security";

const mockRequest = (
  headers: NextApiRequest["headers"],
  body?: unknown,
): NextApiRequest => ({ headers, body }) as NextApiRequest;

describe("MCP request security", () => {
  beforeEach(() => {
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
      ),
    ).toBe("https://internal-langfuse.example.com");
  });

  it("rejects hosts that are not configured exactly", () => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = [
      "*.example.com",
      "internal-langfuse.example.com/api",
    ];

    expect(() =>
      validateMcpRequestSecurity(mockRequest({ host: "evil.example.com" })),
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
      ),
    ).toBe("https://any-origin.example.com");
  });

  it.each([
    [
      "unknown object members",
      () =>
        Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [i, null])),
    ],
    [
      "nested array elements",
      () => ({ params: { arguments: [Array(10_000).fill(null)] } }),
    ],
    [
      "metadata aggregated across a batch",
      () => [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: Array(5_000).fill(null) },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: { _meta: Array(5_000).fill(null) },
        },
      ],
    ],
    [
      "deeply nested input",
      () => {
        let body: unknown = null;
        for (let i = 0; i < 10_001; i++) body = [body];
        return body;
      },
    ],
  ])("rejects excessive %s even with wildcard hosts", (_, createBody) => {
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = ["*"];

    expect(() =>
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, createBody()),
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
      ),
    ).toBeNull();
    expect(
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, Array(10_000).fill(null)),
      ),
    ).toBeNull();
    expect(() =>
      validateMcpRequestSecurity(
        mockRequest({ host: "langfuse.example.com" }, Array(10_001).fill(null)),
      ),
    ).toThrow(PayloadTooLargeError);
  });
});
