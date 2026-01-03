/**
 * This script encrypts blob storage integration secrets that are stored in plaintext.
 *
 * Background:
 * The public API for blob storage integrations was storing secretAccessKey in plaintext,
 * while the tRPC router was already encrypting them. This migration ensures all secrets
 * are encrypted.
 *
 * The migration:
 * 1. Fetches all blob storage integrations
 * 2. For each integration with a secretAccessKey:
 *    - Attempts to decrypt it
 *    - If decryption fails (meaning it's plaintext), encrypts it
 *    - If decryption succeeds or the field is null, skips it
 */

import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt, decrypt } from "@langfuse/shared/encryption";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const _backgroundMigrationId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

export default class EncryptBlobStorageSecrets implements IBackgroundMigration {
  private isAborted = false;
  private isFinished = false;

  async validate(): Promise<{
    valid: boolean;
    invalidReason: string | undefined;
  }> {
    // Check if ENCRYPTION_KEY is available
    try {
      const testString = "test";
      const encrypted = encrypt(testString);
      const decrypted = decrypt(encrypted);
      if (decrypted !== testString) {
        return {
          valid: false,
          invalidReason: "Encryption/decryption validation failed",
        };
      }
      return { valid: true, invalidReason: undefined };
    } catch (error) {
      return {
        valid: false,
        invalidReason: `ENCRYPTION_KEY not available or invalid: ${error}`,
      };
    }
  }

  private isAlreadyEncrypted(value: string): boolean {
    // Encrypted format is: iv:encrypted:authTag (three parts separated by colons)
    const parts = value.split(":");
    if (parts.length !== 3) {
      return false;
    }

    // Try to decrypt - if it succeeds, it's already encrypted
    try {
      decrypt(value);
      return true;
    } catch {
      return false;
    }
  }

  async run(): Promise<void> {
    const start = Date.now();
    logger.info(
      `[Background Migration] Starting encryption of blob storage secrets`,
    );

    let encryptedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    const batchSize = 100;
    let offset = 0;

    while (!this.isAborted && !this.isFinished) {
      // Fetch a batch of blob storage integrations
      const integrations = await prisma.blobStorageIntegration.findMany({
        select: {
          projectId: true,
          secretAccessKey: true,
        },
        skip: offset,
        take: batchSize,
      });

      if (integrations.length === 0) {
        this.isFinished = true;
        break;
      }

      for (const integration of integrations) {
        if (this.isAborted) {
          break;
        }

        processedCount++;

        // Skip if no secret
        if (!integration.secretAccessKey) {
          skippedCount++;
          continue;
        }

        // Check if already encrypted
        if (this.isAlreadyEncrypted(integration.secretAccessKey)) {
          skippedCount++;
          continue;
        }

        // Encrypt the plaintext secret
        try {
          const encryptedSecret = encrypt(integration.secretAccessKey);

          await prisma.blobStorageIntegration.update({
            where: { projectId: integration.projectId },
            data: {
              secretAccessKey: encryptedSecret,
            },
          });

          encryptedCount++;
          logger.info(
            `[Background Migration] Encrypted secret for project ${integration.projectId}`,
          );
        } catch (error) {
          logger.error(
            `[Background Migration] Failed to encrypt secret for project ${integration.projectId}: ${error}`,
          );
        }
      }

      offset += batchSize;

      if (this.isAborted) {
        logger.info(
          `[Background Migration] Encryption of blob storage secrets aborted after processing ${processedCount} integrations (encrypted: ${encryptedCount}, skipped: ${skippedCount})`,
        );
        return;
      }
    }

    logger.info(
      `[Background Migration] Finished encryption of blob storage secrets in ${Date.now() - start}ms - Total: ${processedCount}, Encrypted: ${encryptedCount}, Skipped: ${skippedCount}`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `[Background Migration] Aborting encryption of blob storage secrets`,
    );
    this.isAborted = true;
  }
}

async function main() {
  const migration = new EncryptBlobStorageSecrets();
  const validation = await migration.validate();

  if (!validation.valid) {
    logger.error(`Migration validation failed: ${validation.invalidReason}`);
    throw new Error(`Migration validation failed: ${validation.invalidReason}`);
  }

  await migration.run();
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
