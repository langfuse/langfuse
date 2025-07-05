import {
  decrypt,
  encrypt,
  generateWebhookSecret,
} from "@langfuse/shared/encryption";
import { type ActionCreate, type ActionConfig } from "@langfuse/shared";
import { getActionByIdWithSecrets } from "@langfuse/shared/src/server";

interface WebhookConfigOptions {
  actionConfig: ActionCreate;
  actionId?: string;
  projectId: string;
}

/**
 * Processes webhook action configuration by:
 * 1. Adding default headers
 * 2. Generating or preserving webhook secrets
 * 3. Encrypting secrets for storage
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

  const finalActionConfig = {
    ...actionConfig,
    headers: {
      ...actionConfig.headers,
    },
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
