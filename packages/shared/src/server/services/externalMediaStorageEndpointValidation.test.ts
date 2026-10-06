import { describe, expect, it } from "vitest";
import { OutboundUrlValidationError } from "../outbound-url";
import { validateExternalMediaStorageEndpoint } from "./externalMediaStorageEndpointValidation";

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
