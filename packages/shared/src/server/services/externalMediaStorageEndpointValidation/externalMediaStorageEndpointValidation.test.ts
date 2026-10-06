import { describe, expect, it, vi } from "vitest";
import { OutboundUrlValidationError } from "../../outbound-url";
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
  it.each(["http://127.0.0.1", "http://169.254.169.254", "http://10.0.0.1"])(
    "rejects private endpoint %s without an allowlist",
    async (endpoint) => {
      await expect(
        validateExternalMediaStorageEndpoint(endpoint, strictWhitelist),
      ).rejects.toBeInstanceOf(OutboundUrlValidationError);
    },
  );

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
