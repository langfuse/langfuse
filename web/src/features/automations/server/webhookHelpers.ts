import {
  decrypt,
  encrypt,
  generateWebhookSecret,
} from "@langfuse/shared/encryption";
import {
  type ActionCreate,
  type ActionConfig,
  type SafeWebhookActionConfig,
  type WebhookActionConfigWithSecrets,
} from "@langfuse/shared";
import { getActionByIdWithSecrets } from "@langfuse/shared/src/server";

interface WebhookConfigOptions {
  actionConfig: ActionCreate;
  actionId?: string;
  projectId: string;
}

/**
 * Processes webhook action configuration by:
 * 1. Adding default headers
 * 2. Encrypting secret headers based on secretHeaderKeys
 * 3. Generating display values for secret headers
 * 4. Generating or preserving webhook secrets
 * 5. Encrypting secrets for storage
 */
export async function processWebhookActionConfig({
  actionConfig,
  actionId,
  projectId,
}: WebhookConfigOptions): Promise<{
  finalActionConfig: ActionConfig;
  newUnencryptedWebhookSecret?: string; // For one-time display
}> {
  if (actionConfig.type !== "WEBHOOK") {
    throw new Error("Action type is not WEBHOOK");
  }

  const existingAction = actionId
    ? ((await getActionByIdWithSecrets({
        projectId: projectId!,
        actionId,
      })) ?? undefined)
    : undefined;

  const { secretKey: newSecretKey, displaySecretKey: newDisplaySecretKey } =
    generateWebhookSecret();

  // Process headers - encrypt secret headers and create display values
  const processedHeaders = processHeaders(
    actionConfig.headers,
    actionConfig.secretHeaderKeys,
    existingAction?.config.headers ?? {},
    existingAction?.config.secretHeaderKeys ?? [],
  );

  const finalActionConfig = {
    ...actionConfig,
    headers: processedHeaders.headers,
    secretHeaderKeys: processedHeaders.secretHeaderKeys,
    displayHeaderValues: processedHeaders.displayHeaderValues,
    secretKey: existingAction?.config.secretKey ?? encrypt(newSecretKey),
    displaySecretKey:
      existingAction?.config.displaySecretKey ?? newDisplaySecretKey,
  };

  return {
    finalActionConfig,
    newUnencryptedWebhookSecret: existingAction?.config.secretKey
      ? undefined
      : newSecretKey,
  };
}

/**
 * Processes headers for webhook config:
 * - Encrypts headers marked as secret
 * - Creates display values for secret headers
 * - Preserves existing encrypted values when possible
 */
function processHeaders(
  newHeaders: Record<string, string>,
  newSecretHeaderKeys: string[],
  existingHeaders: Record<string, string>,
  existingSecretHeaderKeys: string[],
): {
  headers: Record<string, string>;
  secretHeaderKeys: string[];
  displayHeaderValues: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const secretHeaderKeys: string[] =
    newSecretHeaderKeys ?? existingSecretHeaderKeys ?? [];
  const displayHeaderValues: Record<string, string> = {};

  // Process each header
  for (const [headerName, headerValue] of Object.entries(newHeaders)) {
    const isSecret = newSecretHeaderKeys.includes(headerName);
    const wasSecret = existingSecretHeaderKeys.includes(headerName);

    if (isSecret) {
      // This header should be encrypted
      if (
        wasSecret &&
        headerValue ===
          getDisplayValueForEncryptedHeader(
            headerName,
            existingHeaders[headerName],
          )
      ) {
        // Value hasn't changed, keep existing encrypted value
        headers[headerName] = existingHeaders[headerName];
        displayHeaderValues[headerName] = headerValue;
      } else {
        // New or changed secret header, encrypt it
        headers[headerName] = encrypt(headerValue);
        displayHeaderValues[headerName] = createDisplayValue(headerValue);
      }
    } else {
      // This header should be in plaintext
      headers[headerName] = headerValue;
      displayHeaderValues[headerName] = headerValue;
    }
  }

  return { headers, secretHeaderKeys, displayHeaderValues };
}

/**
 * Creates a display value for a secret header (masks the value)
 */
function createDisplayValue(value: string): string {
  if (value.length <= 8) {
    return "****";
  }

  // For longer values, show first 4 and last 4 characters
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

/**
 * Gets the display value for a header from existing encrypted value
 */
function getDisplayValueForEncryptedHeader(
  headerName: string,
  encryptedValue: string,
): string {
  try {
    const decryptedValue = decrypt(encryptedValue);
    return createDisplayValue(decryptedValue);
  } catch (error) {
    // If decryption fails, return a generic display value
    return "****";
  }
}

/**
 * Decrypts secret headers for use in webhook execution
 */
export function decryptSecretHeaders(
  headers: Record<string, string>,
  secretHeaderKeys: string[],
): Record<string, string> {
  const decryptedHeaders: Record<string, string> = {};

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (secretHeaderKeys.includes(headerName)) {
      try {
        decryptedHeaders[headerName] = decrypt(headerValue);
      } catch (error) {
        console.error(`Failed to decrypt header ${headerName}:`, error);
        // Skip this header if decryption fails
      }
    } else {
      decryptedHeaders[headerName] = headerValue;
    }
  }

  return decryptedHeaders;
}

/**
 * Extracts webhook secret for one-time display after creation
 */
export function extractWebhookSecret(
  actionConfig: ActionConfig,
): string | undefined {
  if (actionConfig.type !== "WEBHOOK" || !actionConfig.secretKey) {
    return undefined;
  }

  try {
    return decrypt(actionConfig.secretKey);
  } catch (error) {
    console.error("Failed to decrypt webhook secret for display:", error);
    return undefined;
  }
}

/**
 * Converts webhook config with secrets to safe config by only including allowed fields
 */
export function convertToSafeWebhookConfig(
  webhookConfig: WebhookActionConfigWithSecrets,
): SafeWebhookActionConfig {
  return {
    type: webhookConfig.type,
    url: webhookConfig.url,
    secretHeaderKeys: webhookConfig.secretHeaderKeys || [],
    displayHeaderValues: webhookConfig.displayHeaderValues || {},
    apiVersion: webhookConfig.apiVersion,
    displaySecretKey: webhookConfig.displaySecretKey,
  };
}
