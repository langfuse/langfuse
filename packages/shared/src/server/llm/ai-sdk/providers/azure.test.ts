import { AuthenticationError } from "@azure/identity";
import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  AZURE_USE_DEFAULT_CREDENTIALS,
  parseAzureCredential,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import { LLMValidationError } from "../../errors";
import {
  assertAzureHostAllowedForDefaultCredentials,
  resolveAzureProviderAuth,
} from "./azure";

const tokenFailure = vi.hoisted(() => ({ error: undefined as unknown }));

vi.mock("@azure/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@azure/identity")>();
  return {
    ...actual,
    ClientSecretCredential: class {},
    DefaultAzureCredential: class {},
    getBearerTokenProvider: () => async () => {
      if (tokenFailure.error) throw tokenFailure.error;
      return "token";
    },
  };
});

const servicePrincipal = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  clientId: "client",
  clientSecret: "secret",
};

describe("parseAzureCredential", () => {
  it("treats plain strings as API keys and the sentinel as default credentials", () => {
    expect(parseAzureCredential("azure-key")).toEqual({
      type: "api-key",
      apiKey: "azure-key",
    });
    expect(parseAzureCredential(AZURE_USE_DEFAULT_CREDENTIALS)).toEqual({
      type: "default-credentials",
    });
  });

  it("parses a service principal and rejects malformed or unknown fields", () => {
    expect(parseAzureCredential(JSON.stringify(servicePrincipal))).toEqual({
      type: "service-principal",
      ...servicePrincipal,
    });
    expect(() => parseAzureCredential("{not json")).toThrow(
      /Invalid Azure Entra ID credentials/,
    );
    expect(() =>
      parseAzureCredential(
        JSON.stringify({ ...servicePrincipal, tenantId: "../evil" }),
      ),
    ).toThrow(/Tenant ID/);
    expect(() =>
      parseAzureCredential(JSON.stringify({ ...servicePrincipal, extra: 1 })),
    ).toThrow(/Invalid Azure Entra ID credentials/);
  });
});

describe("assertAzureHostAllowedForDefaultCredentials", () => {
  it.each([
    "https://res.openai.azure.com/openai",
    "https://res.cognitiveservices.azure.com/openai",
    "https://res.services.ai.azure.com/openai",
  ])("allows %s", (baseURL) => {
    expect(() =>
      assertAzureHostAllowedForDefaultCredentials(baseURL),
    ).not.toThrow();
  });

  it.each([
    "http://res.openai.azure.com/openai",
    "https://res.azure-api.net/openai",
    "https://res.openai.azure.com.evil.example/openai",
    "https://openai.azure.com/openai",
  ])("rejects %s", (baseURL) => {
    expect(() => assertAzureHostAllowedForDefaultCredentials(baseURL)).toThrow(
      LLMValidationError,
    );
  });
});

describe("resolveAzureProviderAuth", () => {
  it("rejects a custom Authorization header for Entra ID connections", () => {
    expect(() =>
      resolveAzureProviderAuth({
        secretKey: JSON.stringify(servicePrincipal),
        baseURL: "https://res.openai.azure.com/openai",
        extraHeaders: { Authorization: "Bearer other" },
      }),
    ).toThrow(/Remove the Authorization extra header/);
  });

  it("keeps a custom Authorization header for API-key connections", () => {
    expect(
      resolveAzureProviderAuth({
        secretKey: "azure-key",
        baseURL: "https://res.openai.azure.com/openai",
        extraHeaders: { Authorization: "Bearer gateway" },
      }),
    ).toEqual({ apiKey: "azure-key" });
  });

  it("classifies rejected credentials as non-retryable and outages as retryable", async () => {
    const { tokenProvider } = resolveAzureProviderAuth({
      secretKey: JSON.stringify({ ...servicePrincipal, clientId: "errors" }),
      baseURL: "https://res.openai.azure.com/openai",
    });
    if (!tokenProvider) throw new Error("expected a token provider");

    tokenFailure.error = new AuthenticationError(400, {
      error: "invalid_client",
      error_description: "AADSTS7000215: Invalid client secret provided.",
    });
    const rejected = await tokenProvider().catch((error: unknown) => error);
    expect(APICallError.isInstance(rejected)).toBe(true);
    expect(rejected).toMatchObject({
      statusCode: 400,
      isRetryable: false,
      message: expect.stringContaining("AADSTS7000215"),
    });

    tokenFailure.error = new Error("getaddrinfo ENOTFOUND");
    const outage = await tokenProvider().catch((error: unknown) => error);
    expect(outage).toMatchObject({ isRetryable: true });

    tokenFailure.error = undefined;
  });
});
