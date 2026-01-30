import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt, decrypt } from "@langfuse/shared/encryption";

/**
 * Background migration to encrypt previously stored unencrypted secretAccessKey values
 * in the blob_storage_integrations table.
 *
 * Background:
 * - The public API endpoint previously stored secretAccessKey without encryption
 * - The tRPC endpoint correctly encrypted secrets
 * - This migration encrypts any unencrypted secrets
 *
 * Detection:
 * - Encrypted format: `<iv_hex>:<encrypted_hex>:<authTag_hex>` (contains colons)
 * - Unencrypted: Cloud provider secrets (AWS/Azure/GCP) never contain colons
 * - We try to decrypt; if it fails with "Invalid or corrupted cipher format", it's unencrypted
 *
 * This migration is idempotent and can be safely re-run if interrupted.
 */
export default class EncryptBlobStorageSecrets implements IBackgroundMigration {
  private isAborted = false;

  async validate(
    _args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // No special prerequisites - encryption key is validated at decrypt/encrypt time
    return { valid: true, invalidReason: undefined };
  }

  async run(_args: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    logger.info(
      "[Background Migration] Starting blob storage secrets encryption migration",
    );

    try {
      // Fetch all integrations with non-null secretAccessKey
      const integrations = await prisma.blobStorageIntegration.findMany({
        where: { secretAccessKey: { not: null } },
        select: { projectId: true, secretAccessKey: true },
      });

      const total = integrations.length;
      if (total === 0) {
        logger.info(
          "[Background Migration] No integrations to check, migration complete",
        );
        return;
      }
      logger.info(
        `[Background Migration] Found ${total} blob storage integrations to check`,
      );

      let encrypted = 0;
      let alreadyEncrypted = 0;
      let errors = 0;

      for (const integration of integrations) {
        // Check for abort signal
        if (this.isAborted) {
          logger.info(
            `[Background Migration] Migration aborted after processing ${encrypted + alreadyEncrypted} integrations`,
          );
          return;
        }

        if (!integration.secretAccessKey) {
          continue;
        }

        try {
          // Try to decrypt - if it succeeds, already encrypted
          decrypt(integration.secretAccessKey);
          alreadyEncrypted++;
          logger.debug(
            `[Background Migration] Integration ${integration.projectId} already encrypted, skipping`,
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "Invalid or corrupted cipher format"
          ) {
            // Unencrypted - needs encryption
            try {
              const encryptedValue = encrypt(integration.secretAccessKey);
              await prisma.blobStorageIntegration.update({
                where: { projectId: integration.projectId },
                data: { secretAccessKey: encryptedValue },
              });
              encrypted++;
              logger.info(
                `[Background Migration] Encrypted secretAccessKey for project ${integration.projectId}`,
              );
            } catch (encryptError) {
              errors++;
              logger.error(
                `[Background Migration] Failed to encrypt secret for ${integration.projectId}: ${encryptError}`,
                { error: encryptError },
              );
            }
          } else {
            // Different error (wrong key, corrupted data) - log and skip
            errors++;
            logger.error(
              `[Background Migration] Unexpected decryption error for ${integration.projectId}: ${error}`,
              { error },
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[Background Migration] Blob storage secrets encryption completed in ${duration}ms: ` +
          `${encrypted} encrypted, ${alreadyEncrypted} already encrypted, ${errors} errors`,
      );
    } catch (error) {
      logger.error(
        "[Background Migration] Blob storage secrets encryption failed",
        { error },
      );
      throw error;
    }
  }

  async abort(): Promise<void> {
    logger.info(
      "[Background Migration] Aborting EncryptBlobStorageSecrets migration",
    );
    this.isAborted = true;
  }
}

async function main() {
  const migration = new EncryptBlobStorageSecrets();
  await migration.validate({});
  await migration.run({});
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[Background Migration] Migration execution failed: ${error}`,
        error,
      );
      process.exit(1);
    });
}
