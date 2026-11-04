import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateExternalMediaStorageEndpoint } from "./externalMediaStorageEndpointValidation";

vi.mock("../../../env", () => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_HOST: [],
    LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IPS: [],
    LANGFUSE_EXTERNAL_MEDIA_STORAGE_ENDPOINT_WHITELISTED_IP_SEGMENTS: [],
  },
}));

const strictWhitelist = { hosts: [], ips: [], ip_ranges: [] };

describe("validateExternalMediaStorageEndpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["http://127.0.0.1", "blocked-ip"],
    ["http://[::1]", "blocked-ip"],
    ["http://169.254.169.254", "blocked-hostname"],
    ["http://10.0.0.1", "blocked-ip"],
  ])(
    "rejects private endpoint %s without an allowlist",
    async (endpoint, code) => {
      await expect(
        validateExternalMediaStorageEndpoint(endpoint, strictWhitelist),
      ).rejects.toMatchObject({ code });
    },
  );

  it("rejects a hostname that resolves to a private address", async () => {
    vi.spyOn(dns, "resolve4").mockResolvedValue(["10.0.0.5"]);
    vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA"));
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
    ] as never);

    await expect(
      validateExternalMediaStorageEndpoint(
        "https://storage.internal.example.com",
        strictWhitelist,
      ),
    ).rejects.toMatchObject({ code: "blocked-ip" });
    expect(dns.resolve4).toHaveBeenCalledWith("storage.internal.example.com");
  });

  it("rejects endpoints with embedded credentials", async () => {
    await expect(
      validateExternalMediaStorageEndpoint(
        "https://user:pass@storage.example.com",
        strictWhitelist,
      ),
    ).rejects.toMatchObject({
      code: "url-credentials-not-allowed",
    });
  });

  it("allows an explicitly allowlisted private endpoint", async () => {
    await expect(
      validateExternalMediaStorageEndpoint("http://10.0.0.1", {
        hosts: [],
        ips: ["10.0.0.1"],
        ip_ranges: [],
      }),
    ).resolves.toBeUndefined();
  });
});
