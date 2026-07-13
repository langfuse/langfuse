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

  it("declines a missing base URL", () => {
    expect(translateAzureBaseURL(undefined).ok).toBe(false);
    expect(translateAzureBaseURL(null).ok).toBe(false);
    expect(translateAzureBaseURL("").ok).toBe(false);
  });

  it("declines base URLs without the /deployments suffix", () => {
    expect(
      translateAzureBaseURL("https://my-proxy.example.com/openai").ok,
    ).toBe(false);
  });
});
