import { describe, expect, it } from "vitest";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "@langfuse/shared";
import { resolveBedrockAuth } from "@langfuse/shared/src/server";

describe("resolveBedrockAuth", () => {
  it("uses bearer token auth when Bedrock secret contains a Bedrock API key", () => {
    expect(
      resolveBedrockAuth({
        secretKey: JSON.stringify({
          apiKey: "bedrock-api-key-1234",
        }),
        allowDefaultCredentials: true,
      }),
    ).toEqual({
      clientOptions: {
        token: { token: "bedrock-api-key-1234" },
        authSchemePreference: ["httpBearerAuth"],
      },
    });
  });

  it("keeps SigV4 auth when Bedrock secret contains AWS access keys", () => {
    expect(
      resolveBedrockAuth({
        secretKey: JSON.stringify({
          accessKeyId: "AKIAIOSFODNN7EXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        }),
        allowDefaultCredentials: true,
      }),
    ).toEqual({
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      },
    });
  });

  it("preserves the default credential provider chain sentinel behavior", () => {
    expect(
      resolveBedrockAuth({
        secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        allowDefaultCredentials: true,
      }),
    ).toEqual({});
  });

  it("throws when sentinel is used but default credentials are not allowed", () => {
    expect(() =>
      resolveBedrockAuth({
        secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("throws on invalid JSON secret key", () => {
    expect(() =>
      resolveBedrockAuth({
        secretKey: "not-valid-json",
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("throws on JSON that does not match any credential schema", () => {
    expect(() =>
      resolveBedrockAuth({
        secretKey: JSON.stringify({ unknownField: "value" }),
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });
});
