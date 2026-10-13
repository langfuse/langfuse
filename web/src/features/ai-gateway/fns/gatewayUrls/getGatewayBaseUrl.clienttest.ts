// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getGatewayBaseUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/getGatewayBaseUrl";

describe("getGatewayBaseUrl", () => {
  it("prefixes gateway. onto a product host", () => {
    expect(getGatewayBaseUrl(new URL("https://staging.langfuse.com/"))).toBe(
      "https://gateway.staging.langfuse.com/v1",
    );
  });

  it("uses the single-label preview host the certificate covers", () => {
    expect(
      getGatewayBaseUrl(new URL("https://pr-123.preview.langfuse.com/")),
    ).toBe("https://gateway-pr-123.preview.langfuse.com/v1");
  });

  it("points localhost at the local gateway port", () => {
    expect(getGatewayBaseUrl(new URL("http://localhost:3000/"))).toBe(
      "http://localhost:8080/v1",
    );
  });
});
