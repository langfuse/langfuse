import {
  ClientCertificateCredential,
  ClientSecretCredential,
  DefaultAzureCredential,
  ManagedIdentityCredential,
  WorkloadIdentityCredential,
  type TokenCredential,
} from "@azure/identity";
import { StorageSharedKeyCredential } from "@azure/storage-blob";
import { AZURE_CREDENTIAL_MODES, env } from "../../env";

/**
 * The mode is declared explicitly rather than inferred from which variables
 * happen to be set: an AKS node can carry a user-assigned managed identity
 * (`AZURE_CLIENT_ID`) while the workload identity webhook also injects a
 * federated token, so detection would silently pick one of two principals.
 * Same reasoning as `SecretProviderClass` in the Azure Key Vault CSI provider.
 */
export type AzureCredentialMode = (typeof AZURE_CREDENTIAL_MODES)[number];

export type AzureCredentialConfig =
  | { mode: "shared-key"; accountName: string; accountKey: string }
  | {
      mode: "workload-identity";
      clientId?: string;
      tenantId?: string;
      tokenFilePath?: string;
    }
  | { mode: "managed-identity"; clientId?: string; resourceId?: string }
  | {
      mode: "service-principal-secret";
      clientId: string;
      tenantId: string;
      clientSecret: string;
    }
  | {
      mode: "service-principal-certificate";
      clientId: string;
      tenantId: string;
      certificatePath: string;
    }
  | { mode: "default-chain" };

export interface AzureCredentialSettings {
  credentialMode: AzureCredentialMode;
  clientId?: string;
  tenantId?: string;
  federatedTokenFilePath?: string;
  clientSecret?: string;
  clientCertificatePath?: string;
  managedIdentityResourceId?: string;
}

export function azureCredentialSettingsFromEnv(): AzureCredentialSettings {
  return {
    credentialMode: env.LANGFUSE_AZURE_BLOB_CREDENTIAL,
    clientId: env.AZURE_CLIENT_ID,
    tenantId: env.AZURE_TENANT_ID,
    federatedTokenFilePath: env.AZURE_FEDERATED_TOKEN_FILE,
    clientSecret: env.AZURE_CLIENT_SECRET,
    clientCertificatePath: env.AZURE_CLIENT_CERTIFICATE_PATH,
    managedIdentityResourceId: env.LANGFUSE_AZURE_MANAGED_IDENTITY_RESOURCE_ID,
  };
}

/**
 * For callers whose endpoint and credentials are user-supplied (blob storage
 * export integrations). They must never reach the ambient identity: a token
 * credential would send a reusable bearer token for the deployment's own Azure
 * identity to a user-controlled endpoint, whereas a shared key signature is
 * scoped to one request.
 */
export function requireAzureSharedKeyCredential(params: {
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
}): AzureCredentialConfig {
  const { accessKeyId, secretAccessKey } = params;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Azure Blob Storage account name and account key must both be configured`,
    );
  }

  return {
    mode: "shared-key",
    accountName: accessKeyId,
    accountKey: secretAccessKey,
  };
}

export function resolveAzureCredentialConfig(
  bucketCredentials: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
  },
  settings: AzureCredentialSettings = azureCredentialSettingsFromEnv(),
): AzureCredentialConfig {
  const { credentialMode } = settings;

  switch (credentialMode) {
    case "shared-key": {
      const { accessKeyId, secretAccessKey } = bucketCredentials;
      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          `Shared key authentication requires LANGFUSE_S3_*_ACCESS_KEY_ID and LANGFUSE_S3_*_SECRET_ACCESS_KEY. Set LANGFUSE_AZURE_BLOB_CREDENTIAL to authenticate with an Azure AD identity instead`,
        );
      }
      return {
        mode: "shared-key",
        accountName: accessKeyId,
        accountKey: secretAccessKey,
      };
    }

    case "workload-identity":
      // Nothing is required: WorkloadIdentityCredential reads the AZURE_*
      // variables the AKS webhook injects and names whichever one is missing.
      return {
        mode: "workload-identity",
        clientId: settings.clientId,
        tenantId: settings.tenantId,
        tokenFilePath: settings.federatedTokenFilePath,
      };

    case "managed-identity": {
      if (settings.clientId && settings.managedIdentityResourceId) {
        throw new Error(
          `Set only one of AZURE_CLIENT_ID or LANGFUSE_AZURE_MANAGED_IDENTITY_RESOURCE_ID to select a user-assigned managed identity`,
        );
      }
      return {
        mode: "managed-identity",
        clientId: settings.clientId,
        resourceId: settings.managedIdentityResourceId,
      };
    }

    case "service-principal": {
      const { clientId, tenantId, clientSecret, clientCertificatePath } =
        settings;
      if (!clientId || !tenantId) {
        throw new Error(
          `AZURE_CLIENT_ID and AZURE_TENANT_ID are required when LANGFUSE_AZURE_BLOB_CREDENTIAL=service-principal`,
        );
      }
      if (Boolean(clientSecret) === Boolean(clientCertificatePath)) {
        throw new Error(
          `Set exactly one of AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH when LANGFUSE_AZURE_BLOB_CREDENTIAL=service-principal`,
        );
      }
      return clientSecret
        ? {
            mode: "service-principal-secret",
            clientId,
            tenantId,
            clientSecret,
          }
        : {
            mode: "service-principal-certificate",
            clientId,
            tenantId,
            certificatePath: clientCertificatePath as string,
          };
    }

    case "default-chain":
      return { mode: "default-chain" };
  }
}

export function createAzureCredential(
  config: AzureCredentialConfig,
): StorageSharedKeyCredential | TokenCredential {
  switch (config.mode) {
    case "shared-key":
      return new StorageSharedKeyCredential(
        config.accountName,
        config.accountKey,
      );

    case "workload-identity":
      return new WorkloadIdentityCredential({
        clientId: config.clientId,
        tenantId: config.tenantId,
        tokenFilePath: config.tokenFilePath,
      });

    case "managed-identity":
      // The SDK types the selectors as mutually exclusive overloads, so they
      // cannot be passed together even as undefined.
      if (config.clientId) {
        return new ManagedIdentityCredential({ clientId: config.clientId });
      }
      if (config.resourceId) {
        return new ManagedIdentityCredential({ resourceId: config.resourceId });
      }
      return new ManagedIdentityCredential();

    case "service-principal-secret":
      return new ClientSecretCredential(
        config.tenantId,
        config.clientId,
        config.clientSecret,
      );

    case "service-principal-certificate":
      return new ClientCertificateCredential(
        config.tenantId,
        config.clientId,
        config.certificatePath,
      );

    case "default-chain":
      return new DefaultAzureCredential();
  }
}

export function describeAzureCredential(config: AzureCredentialConfig): string {
  switch (config.mode) {
    case "shared-key":
      return `shared key (account ${config.accountName})`;
    case "workload-identity":
      return `workload identity${config.clientId ? ` (client ID ${config.clientId})` : " (client ID from AZURE_CLIENT_ID)"}`;
    case "managed-identity":
      if (config.clientId) {
        return `user-assigned managed identity (client ID ${config.clientId})`;
      }
      if (config.resourceId) {
        return `user-assigned managed identity (resource ID ${config.resourceId})`;
      }
      return "system-assigned managed identity";
    case "service-principal-secret":
      return `service principal with client secret (client ID ${config.clientId})`;
    case "service-principal-certificate":
      return `service principal with certificate (client ID ${config.clientId})`;
    case "default-chain":
      return "DefaultAzureCredential chain";
  }
}
