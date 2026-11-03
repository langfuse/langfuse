import dns from "node:dns/promises";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  OutboundUrlValidationError,
  parseOutboundUrl,
  validateOutboundResolvedIp,
} from "../outbound-url";
import {
  assertGcsBlobStorageBucketAllowed,
  blobStorageEndpointConnectionValidationOptions,
  validateBlobStorageBucketHost,
  validateBlobStorageEndpoint,
} from "./blobStorageEndpointValidation";
import { env } from "../../env";

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

  it("rejects a host outside a configured allowed-hosts list", async () => {
    await expect(
      validateBlobStorageEndpoint("https://blob.example.com", {
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: ["minio.internal"],
      }),
    ).rejects.toMatchObject({
      code: "host-not-allowed",
      message: expect.stringContaining(
        "LANGFUSE_BLOB_STORAGE_ENDPOINT_ALLOWED_HOSTS",
      ),
    });
  });

  it("accepts a listed host even when it is a private address", async () => {
    await expect(
      validateBlobStorageEndpoint("http://10.0.0.1:9000", {
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: ["10.0.0.1"],
      }),
    ).resolves.toBeUndefined();
  });
});

describe("validateBlobStorageBucketHost", () => {
  const allowlist = {
    hosts: [],
    ips: [],
    ip_ranges: [],
    allowedHosts: ["minio.internal"],
  };
  const target = {
    type: "S3_COMPATIBLE" as const,
    endpoint: "http://minio.internal:9000",
    bucketName: "exports",
    forcePathStyle: false,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a virtual-hosted bucket name that resolves to a private address", async () => {
    vi.spyOn(dns, "resolve4").mockResolvedValue(["10.0.0.5"]);
    vi.spyOn(dns, "resolve6").mockRejectedValue(new Error("ENODATA"));
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "10.0.0.5", family: 4 },
    ] as never);

    await expect(
      validateBlobStorageBucketHost(target, allowlist),
    ).rejects.toMatchObject({
      code: "blocked-ip",
      message: expect.stringContaining("Force Path Style"),
    });
  });

  it.each([
    ["path-style is forced", { forcePathStyle: true }],
    ["the endpoint is an IP literal", { endpoint: "http://10.0.0.1:9000" }],
    ["a dotted bucket has a short label", { bucketName: "exports.v2" }],
  ])("skips the check when %s", async (_, override) => {
    const resolve4 = vi.spyOn(dns, "resolve4");

    await expect(
      validateBlobStorageBucketHost(
        { ...target, ...override },
        { ...allowlist, allowedHosts: ["minio.internal", "10.0.0.1"] },
      ),
    ).resolves.toBeUndefined();
    expect(resolve4).not.toHaveBeenCalled();
  });
});

describe("blobStorageEndpointConnectionValidationOptions", () => {
  const allowlist = {
    hosts: [],
    ips: [],
    ip_ranges: [],
    allowedHosts: ["minio.internal", "s3.us-east-1.amazonaws.com"],
  };
  const connectAs =
    (hostname: string, ip = "52.216.0.1") =>
    () =>
      validateOutboundResolvedIp({
        hostname,
        ip,
        whitelist:
          blobStorageEndpointConnectionValidationOptions(allowlist)!.whitelist!,
        logContext: "test",
      });

  it("is off when no list is configured", () => {
    expect(
      blobStorageEndpointConnectionValidationOptions({
        hosts: [],
        ips: [],
        ip_ranges: [],
        allowedHosts: [],
      }),
    ).toBeUndefined();
  });

  it("trusts virtual-hosted bucket names under a listed host", () => {
    expect(connectAs("exports.minio.internal")).not.toThrow();
  });

  it("keeps the private-address block for bucket names, but not for exact listed hosts", () => {
    expect(connectAs("minio.internal", "10.0.0.5")).not.toThrow();
    expect(connectAs("exports.minio.internal", "10.0.0.5")).toThrow(
      expect.objectContaining({ code: "blocked-ip" }),
    );
  });

  it("rejects names that are not a bucket under a listed host", () => {
    for (const hostname of [
      "exports.s3.eu-west-1.amazonaws.com",
      "evilminio.internal",
      "10.0.0.5.minio.internal",
    ]) {
      expect(connectAs(hostname)).toThrow(
        expect.objectContaining({ code: "host-not-allowed" }),
      );
    }
  });
});

describe("assertGcsBlobStorageBucketAllowed", () => {
  const original = {
    buckets: env.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS,
    region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };
  const setEnv = (buckets: string[], region?: string) => {
    env.LANGFUSE_BLOB_STORAGE_GCS_ALLOWED_BUCKETS = buckets;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = region as never;
  };
  const codeOf = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return undefined;
  };

  afterEach(() => setEnv(original.buckets, original.region));

  it("is disabled when no buckets are allowlisted", () => {
    setEnv([]);
    expect(codeOf(() => assertGcsBlobStorageBucketAllowed("any"))).toBe(
      "gcs-bucket-not-allowed",
    );
  });

  it("allows an allowlisted bucket, case- and whitespace-insensitive", () => {
    setEnv(["sc-langfuse-staging"]);
    expect(() =>
      assertGcsBlobStorageBucketAllowed(" SC-Langfuse-Staging "),
    ).not.toThrow();
  });

  it("rejects a bucket outside the allowlist", () => {
    setEnv(["sc-langfuse-staging"]);
    expect(
      codeOf(() => assertGcsBlobStorageBucketAllowed("other-bucket")),
    ).toBe("gcs-bucket-not-allowed");
  });

  it("is never available on Langfuse Cloud, even if a bucket is listed", () => {
    setEnv(["sc-langfuse-staging"], "US");
    expect(
      codeOf(() => assertGcsBlobStorageBucketAllowed("sc-langfuse-staging")),
    ).toBe("gcs-not-allowed");
  });
});
