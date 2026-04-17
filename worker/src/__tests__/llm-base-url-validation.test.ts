import { afterEach, describe, expect, it } from "vitest";
import {
  validateLlmConnectionBaseURL,
  type LlmBaseUrlValidationWhitelist,
} from "../../../packages/shared/src/server/llm/baseUrlValidation";
import { env } from "../../../packages/shared/src/env";

const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
const originalAllowedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
const originalAllowedIps = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS;
const originalAllowedIpSegments =
  env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS;

describe("LLM base URL validation", () => {
  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST =
      originalAllowedHosts;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = originalAllowedIps;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS =
      originalAllowedIpSegments;
  });

  it("should reject localhost by default for self-hosted instances", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("http://localhost:11434/v1"),
    ).rejects.toThrow("Blocked hostname detected");
  });

  it("should allow explicitly allowlisted localhost hosts for self-hosted instances", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: ["localhost"],
      ips: [],
      ip_ranges: [],
    };

    await expect(
      validateLlmConnectionBaseURL("http://localhost:11434/v1", whitelist),
    ).resolves.not.toThrow();
  });

  it("should allow explicitly allowlisted IPv6 localhost literals for self-hosted instances", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: [],
      ips: ["::1"],
      ip_ranges: [],
    };

    await expect(
      validateLlmConnectionBaseURL("http://[::1]:11434/v1", whitelist),
    ).resolves.not.toThrow();
  });

  it("should allow explicitly allowlisted IPv6 CIDR ranges for self-hosted instances", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: [],
      ips: [],
      ip_ranges: ["::1/128"],
    };

    await expect(
      validateLlmConnectionBaseURL("http://[::1]:11434/v1", whitelist),
    ).resolves.not.toThrow();
  });

  it("should ignore self-host allowlists on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: ["localhost"],
      ips: ["127.0.0.1"],
      ip_ranges: ["127.0.0.0/8"],
    };

    await expect(
      validateLlmConnectionBaseURL("https://localhost/v1", whitelist),
    ).rejects.toThrow("Blocked hostname detected");
  });

  it("should allow public HTTPS URLs on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    await expect(
      validateLlmConnectionBaseURL("https://1.1.1.1/v1"),
    ).resolves.not.toThrow();
  });

  it("should allow unresolved public hostnames by default", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("https://gateway.invalid/v1"),
    ).resolves.not.toThrow();
  });

  it("should reject non-HTTPS URLs on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    await expect(
      validateLlmConnectionBaseURL("http://1.1.1.1/v1"),
    ).rejects.toThrow("Only HTTPS base URLs are allowed on Langfuse Cloud");
  });
});
