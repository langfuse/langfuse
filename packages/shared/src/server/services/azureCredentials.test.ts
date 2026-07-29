import { describe, expect, it } from "vitest";

import {
  ClientCertificateCredential,
  ClientSecretCredential,
  DefaultAzureCredential,
  ManagedIdentityCredential,
  WorkloadIdentityCredential,
} from "@azure/identity";
import { StorageSharedKeyCredential } from "@azure/storage-blob";

import {
  createAzureCredential,
  describeAzureCredential,
  requireAzureSharedKeyCredential,
  resolveAzureCredentialConfig,
  type AzureCredentialSettings,
} from "./azureCredentials";

/**
 * Pins the mode -> credential mapping and the validation errors, which is what a
 * misconfigured deployment actually hits.
 */
describe("resolveAzureCredentialConfig", () => {
  const settings = (
    overrides: Partial<AzureCredentialSettings> = {},
  ): AzureCredentialSettings => ({
    credentialMode: "shared-key",
    ...overrides,
  });

  const accountKey = Buffer.from("test-secret-key").toString("base64");
  const sharedKeyBucket = {
    accessKeyId: "test-account",
    secretAccessKey: accountKey,
  };
  const noBucketCredentials = {
    accessKeyId: undefined,
    secretAccessKey: undefined,
  };

  describe("shared-key (default)", () => {
    it("uses the per-bucket account name and key", () => {
      expect(resolveAzureCredentialConfig(sharedKeyBucket, settings())).toEqual(
        {
          mode: "shared-key",
          accountName: "test-account",
          accountKey,
        },
      );
    });

    // No credentials is an error, not an implicit request for the ambient
    // identity.
    it.each([
      ["neither credential", noBucketCredentials],
      ["only an account name", { ...noBucketCredentials, accessKeyId: "acct" }],
      [
        "only an account key",
        { ...noBucketCredentials, secretAccessKey: accountKey },
      ],
    ])("rejects %s and names the alternative modes", (_case, bucket) => {
      expect(() => resolveAzureCredentialConfig(bucket, settings())).toThrow(
        /LANGFUSE_AZURE_BLOB_CREDENTIAL/,
      );
    });
  });

  describe("workload-identity", () => {
    // The AKS webhook injects the AZURE_* variables the SDK reads itself.
    it("requires no explicit parameters", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ credentialMode: "workload-identity" }),
        ),
      ).toEqual({
        mode: "workload-identity",
        clientId: undefined,
        tenantId: undefined,
        tokenFilePath: undefined,
      });
    });

    it("passes overrides through", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({
            credentialMode: "workload-identity",
            clientId: "client-1",
            tenantId: "tenant-1",
            federatedTokenFilePath: "/var/run/secrets/token",
          }),
        ),
      ).toEqual({
        mode: "workload-identity",
        clientId: "client-1",
        tenantId: "tenant-1",
        tokenFilePath: "/var/run/secrets/token",
      });
    });

    it("ignores per-bucket account keys", () => {
      expect(
        resolveAzureCredentialConfig(
          sharedKeyBucket,
          settings({ credentialMode: "workload-identity" }),
        ).mode,
      ).toBe("workload-identity");
    });
  });

  describe("managed-identity", () => {
    it("selects the system-assigned identity when no identifier is given", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ credentialMode: "managed-identity" }),
        ),
      ).toEqual({
        mode: "managed-identity",
        clientId: undefined,
        resourceId: undefined,
      });
    });

    it("selects a user-assigned identity by client ID", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ credentialMode: "managed-identity", clientId: "mi-1" }),
        ),
      ).toEqual({
        mode: "managed-identity",
        clientId: "mi-1",
        resourceId: undefined,
      });
    });

    it("selects a user-assigned identity by resource ID", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({
            credentialMode: "managed-identity",
            managedIdentityResourceId: "/subscriptions/s/resourceGroups/r",
          }),
        ),
      ).toEqual({
        mode: "managed-identity",
        clientId: undefined,
        resourceId: "/subscriptions/s/resourceGroups/r",
      });
    });

    it("rejects both identifier forms at once", () => {
      expect(() =>
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({
            credentialMode: "managed-identity",
            clientId: "mi-1",
            managedIdentityResourceId: "/subscriptions/s/resourceGroups/r",
          }),
        ),
      ).toThrow(/Set only one of/);
    });
  });

  describe("service-principal", () => {
    const base = {
      credentialMode: "service-principal" as const,
      clientId: "sp-1",
      tenantId: "tenant-1",
    };

    it("resolves the client secret variant", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ ...base, clientSecret: "secret" }),
        ),
      ).toEqual({
        mode: "service-principal-secret",
        clientId: "sp-1",
        tenantId: "tenant-1",
        clientSecret: "secret",
      });
    });

    it("resolves the certificate variant", () => {
      expect(
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ ...base, clientCertificatePath: "/certs/sp.pem" }),
        ),
      ).toEqual({
        mode: "service-principal-certificate",
        clientId: "sp-1",
        tenantId: "tenant-1",
        certificatePath: "/certs/sp.pem",
      });
    });

    it.each([
      ["no client ID", { ...base, clientId: undefined, clientSecret: "s" }],
      ["no tenant ID", { ...base, tenantId: undefined, clientSecret: "s" }],
    ])("rejects %s", (_case, overrides) => {
      expect(() =>
        resolveAzureCredentialConfig(noBucketCredentials, settings(overrides)),
      ).toThrow(/AZURE_CLIENT_ID and AZURE_TENANT_ID/);
    });

    it.each([
      ["neither a secret nor a certificate", {}],
      [
        "both a secret and a certificate",
        { clientSecret: "s", clientCertificatePath: "/certs/sp.pem" },
      ],
    ])("rejects %s", (_case, overrides) => {
      expect(() =>
        resolveAzureCredentialConfig(
          noBucketCredentials,
          settings({ ...base, ...overrides }),
        ),
      ).toThrow(/exactly one of/);
    });
  });

  it("resolves default-chain without any parameters", () => {
    expect(
      resolveAzureCredentialConfig(
        noBucketCredentials,
        settings({ credentialMode: "default-chain" }),
      ),
    ).toEqual({ mode: "default-chain" });
  });
});

describe("requireAzureSharedKeyCredential", () => {
  // User-configured integrations must never reach the ambient identity: their
  // endpoint is user-supplied.
  it("returns a shared key config when both credentials are present", () => {
    expect(
      requireAzureSharedKeyCredential({
        accessKeyId: "acct",
        secretAccessKey: "key",
      }),
    ).toEqual({ mode: "shared-key", accountName: "acct", accountKey: "key" });
  });

  it.each([
    ["neither", { accessKeyId: undefined, secretAccessKey: undefined }],
    [
      "only an account name",
      { accessKeyId: "acct", secretAccessKey: undefined },
    ],
    ["only a key", { accessKeyId: undefined, secretAccessKey: "key" }],
  ])("throws when given %s", (_case, credentials) => {
    expect(() => requireAzureSharedKeyCredential(credentials)).toThrow(
      /must both be configured/,
    );
  });
});

describe("createAzureCredential", () => {
  it.each([
    [
      "shared-key",
      { mode: "shared-key" as const, accountName: "a", accountKey: "Yg==" },
      StorageSharedKeyCredential,
    ],
    [
      "workload-identity",
      {
        mode: "workload-identity" as const,
        clientId: "c",
        tenantId: "00000000-0000-0000-0000-000000000000",
        tokenFilePath: "/var/run/secrets/token",
      },
      WorkloadIdentityCredential,
    ],
    [
      "managed-identity",
      { mode: "managed-identity" as const, clientId: "c" },
      ManagedIdentityCredential,
    ],
    [
      "service-principal-secret",
      {
        mode: "service-principal-secret" as const,
        clientId: "c",
        tenantId: "00000000-0000-0000-0000-000000000000",
        clientSecret: "s",
      },
      ClientSecretCredential,
    ],
    [
      "default-chain",
      { mode: "default-chain" as const },
      DefaultAzureCredential,
    ],
  ])("maps %s to its credential class", (_name, config, expected) => {
    expect(createAzureCredential(config)).toBeInstanceOf(expected);
  });

  // The certificate is read lazily, so an absent path surfaces on getToken.
  it("maps service-principal-certificate to ClientCertificateCredential", () => {
    expect(
      createAzureCredential({
        mode: "service-principal-certificate",
        clientId: "c",
        tenantId: "00000000-0000-0000-0000-000000000000",
        certificatePath: "/certs/sp.pem",
      }),
    ).toBeInstanceOf(ClientCertificateCredential);
  });
});

describe("describeAzureCredential", () => {
  it("names the identity without exposing secrets", () => {
    expect(
      describeAzureCredential({
        mode: "service-principal-secret",
        clientId: "sp-1",
        tenantId: "tenant-1",
        clientSecret: "super-secret",
      }),
    ).toBe("service principal with client secret (client ID sp-1)");
  });

  it("distinguishes system-assigned from user-assigned managed identity", () => {
    expect(describeAzureCredential({ mode: "managed-identity" })).toBe(
      "system-assigned managed identity",
    );
    expect(
      describeAzureCredential({ mode: "managed-identity", clientId: "mi-1" }),
    ).toBe("user-assigned managed identity (client ID mi-1)");
  });
});
