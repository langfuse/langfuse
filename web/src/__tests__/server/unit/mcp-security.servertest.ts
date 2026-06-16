const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_MCP_ALLOWED_HOSTS: [] as string[],
    NEXTAUTH_URL: "https://langfuse.example.com",
    NODE_ENV: "production",
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

import type { NextApiRequest } from "next";
import { validateMcpRequestSecurity } from "@/src/features/mcp/server/security";

const mockRequest = (headers: NextApiRequest["headers"]): NextApiRequest =>
  ({ headers }) as NextApiRequest;

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
    mockEnv.env.LANGFUSE_MCP_ALLOWED_HOSTS = ["internal-langfuse.example.com"];

    expect(() =>
      validateMcpRequestSecurity(mockRequest({ host: "evil.example.com" })),
    ).toThrow("Invalid Host header: evil.example.com");
  });
});
