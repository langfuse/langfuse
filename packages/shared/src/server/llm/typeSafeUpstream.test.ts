import { describe, expect, it } from "vitest";
import { resolveTypeSafeUpstream, TYPESAFE_UPSTREAMS } from "./types";

describe("resolveTypeSafeUpstream", () => {
  it("resolves every preset by its exact base URL", () => {
    for (const upstream of TYPESAFE_UPSTREAMS) {
      if (upstream.baseURL === null) continue;
      expect(resolveTypeSafeUpstream(upstream.baseURL).id).toBe(upstream.id);
    }
  });

  it("resolves no base URL to TypeSafe and unknown URLs to custom", () => {
    expect(resolveTypeSafeUpstream(null).id).toBe("typesafe");
    expect(resolveTypeSafeUpstream(undefined).id).toBe("typesafe");
    expect(resolveTypeSafeUpstream("").id).toBe("typesafe");
    expect(resolveTypeSafeUpstream("https://example.com/v1").id).toBe("custom");
    expect(resolveTypeSafeUpstream("not a url").id).toBe("custom");
  });

  it.each([
    "https://console.nace.ai/v1/",
    "https://console.nace.ai/v1//",
    "https://CONSOLE.NACE.AI/v1",
    "HTTPS://console.nace.ai/v1",
    "https://console.nace.ai:443/v1",
    " https://console.nace.ai/v1 ",
  ])("resolves the equivalent form %j to nace", (baseURL) => {
    expect(resolveTypeSafeUpstream(baseURL).id).toBe("nace");
  });

  it.each([
    "http://console.nace.ai/v1",
    "https://console.nace.ai:8443/v1",
    "https://console.nace.ai/v2",
    "https://console.nace.ai/V1",
    "https://console.nace.ai/v1?x=1",
    "https://console.nace.ai.evil.com/v1",
  ])("does not treat %j as nace", (baseURL) => {
    expect(resolveTypeSafeUpstream(baseURL).id).toBe("custom");
  });

  it("matches the other presets through equivalent forms", () => {
    expect(
      resolveTypeSafeUpstream("https://openrouter.ai:443/api/v1/").id,
    ).toBe("openrouter");
    expect(
      resolveTypeSafeUpstream("https://AI-Gateway.vercel.sh/typesafe/v1/").id,
    ).toBe("vercel-ai-gateway");
  });
});
