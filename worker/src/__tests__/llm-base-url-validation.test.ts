import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns/promises";
import {
  llmBaseUrlWhitelistFromEnv,
  validateLlmConnectionBaseURL,
  type LlmBaseUrlValidationWhitelist,
} from "../../../packages/shared/src/server/llm/baseUrlValidation";
import { env } from "../../../packages/shared/src/env";

const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
const originalAllowedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
const originalAllowedIps = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS;
const originalAllowedIpSegments =
  env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS;
const originalPositiveAllowlist = env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS;
const originalBlockedIpSegments = env.LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS;

describe("LLM base URL validation", () => {
  beforeEach(() => {
    vi.spyOn(dns, "resolve4").mockRejectedValue(new Error("ENOTFOUND"));
    vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA"));
    vi.spyOn(dns, "lookup").mockRejectedValue(new Error("ENOTFOUND"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST =
      originalAllowedHosts;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = originalAllowedIps;
    (env as any).LANGFUSE_LLM_CONNECTION_WHITELISTED_IP_SEGMENTS =
      originalAllowedIpSegments;
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = originalPositiveAllowlist;
    env.LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS = originalBlockedIpSegments;
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
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(validateLlmConnectionBaseURL("http://vm/v1")).rejects.toThrow(
      "Blocked IP address detected",
    );

    expect(dns.resolve4).toHaveBeenCalledWith("vm");
    expect(dns.resolve6).toHaveBeenCalledWith("vm");
    expect(dns.lookup).toHaveBeenCalledWith("vm", { all: true });
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

  it("should reject hostnames that fail DNS resolution to close the SSRF rebinding gap", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("https://gateway.invalid/v1"),
    ).rejects.toThrow(/DNS lookup failed/);
  });

  it("should allow unresolved hostnames when explicitly allowlisted", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: ["gateway.invalid"],
      ips: [],
      ip_ranges: [],
    };

    await expect(
      validateLlmConnectionBaseURL("https://gateway.invalid/v1", whitelist),
    ).resolves.not.toThrow();
  });

  it("should reject unresolved hostnames on Langfuse Cloud regardless of whitelist", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    const whitelist: LlmBaseUrlValidationWhitelist = {
      hosts: ["gateway.invalid"],
      ips: [],
      ip_ranges: [],
    };

    await expect(
      validateLlmConnectionBaseURL("https://gateway.invalid/v1", whitelist),
    ).rejects.toThrow(/DNS lookup failed/);
  });

  it("rejects hosts that are not on the positive allowlist", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("https://1.1.1.1/v1", {
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: ["llm.internal"],
      }),
    ).rejects.toMatchObject({ code: "host-not-allowed" });
  });

  it("allows a private host that is on the positive allowlist", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      validateLlmConnectionBaseURL("http://localhost:11434/v1", {
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: ["localhost"],
      }),
    ).resolves.not.toThrow();
  });

  it("still allows other public hosts when only an exemption host is set", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    vi.spyOn(dns, "resolve4").mockResolvedValue(["1.1.1.1"]);
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "1.1.1.1", family: 4 },
    ]);

    await expect(
      validateLlmConnectionBaseURL("https://api.openai.com/v1", {
        hosts: ["localhost"],
        ips: [],
        ip_ranges: [],
      }),
    ).resolves.not.toThrow();
  });

  it("ignores a positive host allowlist on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    await expect(
      validateLlmConnectionBaseURL("https://1.1.1.1/v1", {
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: ["llm.internal"],
      }),
    ).resolves.not.toThrow();
  });

  it("blocks public addresses listed in LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_OUTBOUND_BLOCKED_IP_SEGMENTS = ["1.1.1.0/24"];

    await expect(
      validateLlmConnectionBaseURL("https://1.1.1.1/v1"),
    ).rejects.toMatchObject({ code: "blocked-ip" });
  });

  it("reads the positive allowlist from the environment on self-hosted", () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["llm.internal"];

    expect(llmBaseUrlWhitelistFromEnv().allowedHosts).toEqual(["llm.internal"]);
  });

  it("should reject non-HTTPS URLs on Langfuse Cloud", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

    await expect(
      validateLlmConnectionBaseURL("http://1.1.1.1/v1"),
    ).rejects.toThrow("Only HTTPS base URLs are allowed on Langfuse Cloud");
  });
});
