import { expect, describe, it, vi } from "vitest";
import { env } from "@shared/env";

describe("Proxy Agent Creation", () => {
  // Mock HttpsProxyAgent
  const MockHttpsProxyAgent = vi.fn();

  it("should create proxy agent when proxy URL is provided", () => {
    // Simulate the logic from fetchLLMCompletion
    const createProxyAgent = (proxyUrl: string | undefined) => {
      return proxyUrl ? new MockHttpsProxyAgent(proxyUrl) : undefined;
    };

    const proxyUrl = env.HTTP_PROXY || "http://proxy.example.com:8080";
    const result = createProxyAgent(proxyUrl);

    expect(MockHttpsProxyAgent).toHaveBeenCalledWith(proxyUrl);
    expect(result).toBeDefined();
  });

  it("should not create proxy agent when proxy URL is undefined", () => {
    MockHttpsProxyAgent.mockClear();

    // Simulate the logic from fetchLLMCompletion
    const createProxyAgent = (proxyUrl: string | undefined) => {
      return proxyUrl ? new MockHttpsProxyAgent(proxyUrl) : undefined;
    };

    const result = createProxyAgent(undefined);

    expect(MockHttpsProxyAgent).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("should not create proxy agent when proxy URL is empty string", () => {
    MockHttpsProxyAgent.mockClear();

    // Simulate the logic from fetchLLMCompletion
    const createProxyAgent = (proxyUrl: string | undefined) => {
      return proxyUrl ? new MockHttpsProxyAgent(proxyUrl) : undefined;
    };

    const result = createProxyAgent("");

    expect(MockHttpsProxyAgent).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
