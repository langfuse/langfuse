// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getGatewayBaseUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/getGatewayBaseUrl";

describe("getGatewayBaseUrl", () => {
  it("returns the staging product host that serves the gateway", () => {
    expect(getGatewayBaseUrl(new URL("https://staging.langfuse.com/"))).toBe(
      "https://staging.langfuse.com",
    );
  });

  it("prefixes gateway. onto a product host", () => {
    expect(getGatewayBaseUrl(new URL("https://cloud.langfuse.com/"))).toBe(
      "https://gateway.cloud.langfuse.com/v1",
    );
  });

  it("uses the single-label preview host the certificate covers", () => {
    expect(
      getGatewayBaseUrl(new URL("https://pr-123.preview.langfuse.com/")),
    ).toBe("https://gateway-pr-123.preview.langfuse.com/v1");
  });

  it.each([
    "pr-abc.preview.langfuse.com",
    "pr-123.preview.langfuse.com.example.org",
  ])("keeps the standard prefix for non-preview host %s", (hostname) => {
    expect(getGatewayBaseUrl(new URL(`https://${hostname}/`))).toBe(
      `https://gateway.${hostname}/v1`,
    );
  });

  it("points localhost at the local gateway port", () => {
    expect(getGatewayBaseUrl(new URL("http://localhost:3000/"))).toBe(
      "http://localhost:8080/v1",
    );
  });
});
