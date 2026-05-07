import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolve4Mock, resolve6Mock, lookupMock } = vi.hoisted(() => ({
  resolve4Mock: vi.fn<(hostname: string) => Promise<string[]>>(),
  resolve6Mock: vi.fn<(hostname: string) => Promise<string[]>>(),
  lookupMock:
    vi.fn<
      (
        hostname: string,
        options: { all: true },
      ) => Promise<Array<{ address: string; family: 4 | 6 }>>
    >(),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: resolve4Mock,
    resolve6: resolve6Mock,
    lookup: lookupMock,
  },
  resolve4: resolve4Mock,
  resolve6: resolve6Mock,
  lookup: lookupMock,
}));

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
  beforeEach(() => {
    vi.clearAllMocks();

    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));
    resolve6Mock.mockRejectedValue(new Error("ENODATA"));
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
  });

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

  it("should reject encoded delimiter userinfo SSRF bypass attempts", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("https://example.com%2F@127.0.0.1/v1"),
    ).rejects.toThrow(
      "URL credentials are not allowed. Use authentication headers instead.",
    );
  });

  it("should reject URLs with embedded credentials", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("https://user:pass@example.com/v1"),
    ).rejects.toThrow(
      "URL credentials are not allowed. Use authentication headers instead.",
    );
  });

  it("should reject hostnames that resolve to blocked IPs through local lookup", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    await expect(validateLlmConnectionBaseURL("http://vm/v1")).rejects.toThrow(
      "Blocked IP address detected",
    );

    expect(resolve4Mock).toHaveBeenCalledWith("vm");
    expect(resolve6Mock).toHaveBeenCalledWith("vm");
    expect(lookupMock).toHaveBeenCalledWith("vm", { all: true });
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
