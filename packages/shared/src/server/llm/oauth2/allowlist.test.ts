import { APICallError, RetryError } from "ai";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { env } from "../../../env";
import { assertOAuth2TokenEndpointAllowed } from "./allowlist";
import { OAuth2TokenError, findOAuth2TokenError } from "./errors";

describe("assertOAuth2TokenEndpointAllowed", () => {
  const originalAllowedTokenEndpoints =
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS;
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = [];
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS =
      originalAllowedTokenEndpoints;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  function catchError(fn: () => void): unknown {
    try {
      fn();
      return undefined;
    } catch (error) {
      return error;
    }
  }

  test("throws a disabled error when the allowlist is unset", () => {
    const error = catchError(() =>
      assertOAuth2TokenEndpointAllowed("https://idp.example.com/token"),
    );

    expect(error).toBeInstanceOf(OAuth2TokenError);
    expect((error as OAuth2TokenError).kind).toBe("disabled");
    expect((error as OAuth2TokenError).message).toBe(
      "OAuth2 client credentials are disabled: set LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS",
    );
  });

  test("allows a listed endpoint called with a different case and default port", () => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [
      "https://idp.example.com/token",
    ];

    expect(() =>
      assertOAuth2TokenEndpointAllowed("https://IDP.example.com:443/token"),
    ).not.toThrow();
  });

  test("rejects an endpoint whose resolved URL differs from the listed one by a trailing slash, naming the resolved endpoint", () => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [
      "https://idp.example.com/token",
    ];

    const error = catchError(() =>
      assertOAuth2TokenEndpointAllowed("https://idp.example.com/token/"),
    );

    expect(error).toBeInstanceOf(OAuth2TokenError);
    expect((error as OAuth2TokenError).kind).toBe("disabled");
    expect((error as OAuth2TokenError).message).toContain(
      "not in LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS: https://idp.example.com/token/",
    );
  });

  test("rejects a listed http endpoint whose host is not in LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST", () => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = ["http://kc:8080/t"];

    const error = catchError(() =>
      assertOAuth2TokenEndpointAllowed("http://kc:8080/t"),
    );

    expect(error).toBeInstanceOf(OAuth2TokenError);
    expect((error as OAuth2TokenError).kind).toBe("config");
    expect((error as OAuth2TokenError).message).toMatch(/https/i);
  });

  test("allows the same http endpoint once its host is whitelisted", () => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = ["http://kc:8080/t"];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["kc"];

    expect(() =>
      assertOAuth2TokenEndpointAllowed("http://kc:8080/t"),
    ).not.toThrow();
  });

  test("rejects the whitelisted http endpoint on Langfuse Cloud", () => {
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = ["http://kc:8080/t"];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["kc"];
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";

    const error = catchError(() =>
      assertOAuth2TokenEndpointAllowed("http://kc:8080/t"),
    );

    expect(error).toBeInstanceOf(OAuth2TokenError);
    expect((error as OAuth2TokenError).kind).toBe("config");
  });
});

describe("findOAuth2TokenError", () => {
  test("walks the cause chain to find a nested OAuth2TokenError", () => {
    const oauthError = new OAuth2TokenError("unavailable", "boom");
    const wrapped = new Error("x", {
      cause: new Error("y", { cause: oauthError }),
    });

    expect(findOAuth2TokenError(wrapped)).toBe(oauthError);
  });

  test("returns undefined when there is no OAuth2TokenError in the chain", () => {
    expect(findOAuth2TokenError(new Error("plain"))).toBeUndefined();
  });

  test("is cycle-safe", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b", { cause: a }) as Error & { cause?: unknown };
    a.cause = b; // cycle: a -> b -> a

    expect(findOAuth2TokenError(a)).toBeUndefined();
  });

  test("follows a RetryError's lastError (its constructor never sets cause) into a wrapped OAuth2TokenError", () => {
    const oauthError = new OAuth2TokenError(
      "unavailable",
      "OAuth2 token endpoint unavailable after 3 attempts: 503",
    );
    const apiCallError = new APICallError({
      message: "fetch failed",
      url: "https://idp.example.com/token",
      requestBodyValues: {},
      cause: oauthError,
    });
    const retryError = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [apiCallError],
    });

    expect(findOAuth2TokenError(retryError)).toBe(oauthError);
  });

  test("is cycle-safe across RetryError.lastError hops", () => {
    const first = new RetryError({
      message: "a",
      reason: "maxRetriesExceeded",
      errors: [],
    });
    const second = new RetryError({
      message: "b",
      reason: "maxRetriesExceeded",
      errors: [first],
    });
    // cycle: second.lastError -> first, first.lastError -> second
    Object.defineProperty(first, "lastError", { value: second });

    expect(findOAuth2TokenError(second)).toBeUndefined();
  });
});
