import { describe, expect, it } from "vitest";

import { translateAzureBaseURL } from "./azure";

describe("translateAzureBaseURL", () => {
  it("strips the trailing /deployments segment", () => {
    expect(
      translateAzureBaseURL(
        "https://my-instance.openai.azure.com/openai/deployments",
      ),
    ).toEqual({
      ok: true,
      value: "https://my-instance.openai.azure.com/openai",
    });
  });

  it("tolerates trailing slashes", () => {
    expect(
      translateAzureBaseURL(
        "https://my-instance.openai.azure.com/openai/deployments/",
      ),
    ).toEqual({
      ok: true,
      value: "https://my-instance.openai.azure.com/openai",
    });
  });

  it("strips deployment-specific base URLs", () => {
    expect(
      translateAzureBaseURL(
        "https://my-instance.openai.azure.com/openai/deployments/gpt4o-deployment",
      ),
    ).toEqual({
      ok: true,
      value: "https://my-instance.openai.azure.com/openai",
    });
  });

  it("strips full chat completion base URLs", () => {
    expect(
      translateAzureBaseURL(
        "https://my-instance.openai.azure.com/openai/deployments/gpt4o-deployment/chat/completions?api-version=2025-02-01-preview",
      ),
    ).toEqual({
      ok: true,
      value: "https://my-instance.openai.azure.com/openai",
    });
  });

  it("declines a missing base URL", () => {
    expect(translateAzureBaseURL(undefined).ok).toBe(false);
    expect(translateAzureBaseURL(null).ok).toBe(false);
    expect(translateAzureBaseURL("").ok).toBe(false);
  });

  it("passes through base URLs without the /deployments suffix", () => {
    expect(
      translateAzureBaseURL("https://my-proxy.example.com/openai"),
    ).toEqual({
      ok: true,
      value: "https://my-proxy.example.com/openai",
    });
  });

  it("does not strip non-deployments path segments containing deployments", () => {
    expect(
      translateAzureBaseURL("https://my-proxy.example.com/deployments-proxy"),
    ).toEqual({
      ok: true,
      value: "https://my-proxy.example.com/deployments-proxy",
    });
  });
});
