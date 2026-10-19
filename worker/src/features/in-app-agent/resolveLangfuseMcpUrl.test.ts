import { describe, expect, it } from "vitest";

import { resolveLangfuseMcpUrl } from "./resolveLangfuseMcpUrl";

describe("resolveLangfuseMcpUrl", () => {
  it("prefers the MCP base URL so NEXTAUTH_URL can stay externally resolvable", () => {
    expect(
      resolveLangfuseMcpUrl({
        mcpBaseUrl: "http://langfuse-web:3000",
        nextAuthUrl: "https://langfuse.example.com",
      }),
    ).toBe("http://langfuse-web:3000/api/public/mcp");
  });

  it("falls back to NEXTAUTH_URL, dropping the auth suffix and keeping a base path", () => {
    expect(
      resolveLangfuseMcpUrl({ nextAuthUrl: "https://example.com/api/auth" }),
    ).toBe("https://example.com/api/public/mcp");
    expect(
      resolveLangfuseMcpUrl({
        nextAuthUrl: "https://example.com/langfuse/api/auth/",
      }),
    ).toBe("https://example.com/langfuse/api/public/mcp");
    expect(
      resolveLangfuseMcpUrl({ nextAuthUrl: "https://example.com/langfuse/" }),
    ).toBe("https://example.com/langfuse/api/public/mcp");
  });

  it("returns null when neither is configured", () => {
    expect(resolveLangfuseMcpUrl({})).toBeNull();
  });
});
