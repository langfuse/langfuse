import { describe, it, expect } from "vitest";
import { OutboundUrlValidationError, parseOutboundUrl } from "../outbound-url";
import { validateBlobStorageEndpoint } from "./blobStorageEndpointValidation";

// Non-empty whitelist turns on validation in a non-cloud (DEV) deployment; the
// entries are an *allow* list, so an endpoint outside them is still checked.
const enablingWhitelist = { hosts: [], ips: [], ip_ranges: ["203.0.113.0/24"] };

describe("outbound-url validation error typing", () => {
  it("parseOutboundUrl throws a typed error with a specific code", () => {
    try {
      parseOutboundUrl("http://user:pass@example.com");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OutboundUrlValidationError);
      expect((error as OutboundUrlValidationError).code).toBe(
        "url-credentials-not-allowed",
      );
    }
  });
});

describe("validateBlobStorageEndpoint", () => {
  it("rejects a disallowed protocol as a typed validation error", async () => {
    await expect(
      validateBlobStorageEndpoint("ftp://blob.example.com", enablingWhitelist),
    ).rejects.toMatchObject({
      name: "OutboundUrlValidationError",
      code: "protocol-not-allowed",
    });
  });

  it("rejects a blocked private IP and preserves the code through the guidance re-wrap", async () => {
    let caught: unknown;
    try {
      await validateBlobStorageEndpoint("http://10.0.0.1", enablingWhitelist);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OutboundUrlValidationError);
    expect((caught as OutboundUrlValidationError).code).toBe("blocked-ip");
    // The catch appends self-hosted guidance to the single authoritative
    // message and does NOT chain `cause` (downstream formatters prefer a
    // cause's message and would otherwise drop the guidance / duplicate text).
    expect((caught as Error).message).toContain("Blocked IP address detected");
    expect((caught as Error).message).toContain(
      "LANGFUSE_BLOB_STORAGE_ENDPOINT_WHITELISTED_HOST",
    );
    expect((caught as Error).cause).toBeUndefined();
  });

  it("no-ops when validation is disabled (empty whitelist, non-cloud)", async () => {
    await expect(
      validateBlobStorageEndpoint("http://10.0.0.1", {
        hosts: [],
        ips: [],
        ip_ranges: [],
      }),
    ).resolves.toBeUndefined();
  });
});
