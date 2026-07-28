const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_MCP_ALLOWED_HOSTS: [] as string[],
    LANGFUSE_MCP_TRUST_FORWARDED_HEADERS: undefined as string | undefined,
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
    mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = undefined;
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

  describe("X-Forwarded-Host handling", () => {
    it("honors X-Forwarded-Host when LANGFUSE_MCP_TRUST_FORWARDED_HEADERS is enabled", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "true";

      expect(
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse-web-internal:3000",
            "x-forwarded-host": "langfuse.example.com",
          }),
        ),
      ).toBe(null);
    });

    it("validates the Origin header against the forwarded host's allowlist entry", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "true";

      expect(
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse-web-internal:3000",
            "x-forwarded-host": "langfuse.example.com",
            origin: "https://langfuse.example.com",
          }),
        ),
      ).toBe("https://langfuse.example.com");
    });

    it("uses the first entry of a comma-separated X-Forwarded-Host list", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "true";

      expect(
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse-web-internal:3000",
            "x-forwarded-host": "langfuse.example.com, proxy.internal",
          }),
        ),
      ).toBe(null);
    });

    it("rejects a forwarded host that is not in the allowlist", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "true";

      expect(() =>
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse.example.com",
            "x-forwarded-host": "evil.example.com",
          }),
        ),
      ).toThrow("Invalid X-Forwarded-Host header: evil.example.com");
    });

    it("falls back to the Host header when X-Forwarded-Host is absent", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "true";

      expect(
        validateMcpRequestSecurity(
          mockRequest({ host: "langfuse.example.com" }),
        ),
      ).toBe(null);
    });

    it("ignores X-Forwarded-Host by default (flag unset)", () => {
      expect(() =>
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse-web-internal:3000",
            "x-forwarded-host": "langfuse.example.com",
          }),
        ),
      ).toThrow("Invalid Host header: langfuse-web-internal:3000");
    });

    it("ignores X-Forwarded-Host when the flag is explicitly disabled", () => {
      mockEnv.env.LANGFUSE_MCP_TRUST_FORWARDED_HEADERS = "false";

      expect(() =>
        validateMcpRequestSecurity(
          mockRequest({
            host: "langfuse-web-internal:3000",
            "x-forwarded-host": "langfuse.example.com",
          }),
        ),
      ).toThrow("Invalid Host header: langfuse-web-internal:3000");
    });
  });
});
