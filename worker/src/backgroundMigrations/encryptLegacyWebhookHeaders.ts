import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  createDisplayHeaders,
  encryptSecretHeaders,
  logger,
  mergeHeaders,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { isWebhookActionConfig } from "@langfuse/shared";

const BATCH_SIZE = 500;

/**
 * Background migration that encrypts webhook headers stored in the deprecated
 * plaintext `config.headers` field.
 *
 * Legacy headers predate the secret flag and commonly carry credentials. Each
 * one not already overridden by `requestHeaders` is moved into
 * `requestHeaders` as an encrypted secret, its masked value is added to
 * `displayHeaders`, and `headers` is emptied.
 *
 * Rows are updated only if their config is unchanged since it was read, so a
 * concurrent edit is never overwritten; such rows are converted on that edit
 * instead. The migration is idempotent and can be safely re-run if interrupted.
 */
export default class EncryptLegacyWebhookHeaders implements IBackgroundMigration {
  private isAborted = false;

  async validate(
    _args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    return { valid: true, invalidReason: undefined };
  }

  async run(_args: Record<string, unknown>): Promise<void> {
    const startTime = Date.now();
    logger.info(
      "[Background Migration] Starting legacy webhook header encryption",
    );

    let cursor: string | undefined;
    let encrypted = 0;
    let skipped = 0;
    let errors = 0;

    while (true) {
      if (this.isAborted) {
        logger.info(
          `[Background Migration] Legacy webhook header encryption aborted after encrypting ${encrypted} actions`,
        );
        return;
      }

      const actions = await prisma.action.findMany({
        where: { type: "WEBHOOK" },
        select: { id: true, config: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (actions.length === 0) break;
      cursor = actions[actions.length - 1].id;

      for (const action of actions) {
        const config = action.config;
        if (!isWebhookActionConfig(config)) continue;
        if (!config.headers || Object.keys(config.headers).length === 0) {
          continue;
        }

        const legacyHeaders = mergeHeaders(
          Object.fromEntries(
            Object.entries(config.headers).filter(
              ([key]) => !(key in (config.requestHeaders ?? {})),
            ),
          ),
        );

        try {
          const { count } = await prisma.action.updateMany({
            where: { id: action.id, config: { equals: config } },
            data: {
              config: {
                ...config,
                headers: {},
                requestHeaders: {
                  ...encryptSecretHeaders(legacyHeaders),
                  ...config.requestHeaders,
                },
                displayHeaders: {
                  ...config.displayHeaders,
                  ...createDisplayHeaders(legacyHeaders),
                },
              },
            },
          });
          if (count === 1) {
            encrypted++;
          } else {
            skipped++;
          }
        } catch (error) {
          errors++;
          logger.error(
            `[Background Migration] Failed to encrypt legacy webhook headers for action ${action.id}`,
            { error },
          );
        }
      }
    }

    logger.info(
      `[Background Migration] Legacy webhook header encryption completed in ${Date.now() - startTime}ms: ` +
        `${encrypted} encrypted, ${skipped} changed concurrently, ${errors} errors`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      "[Background Migration] Aborting EncryptLegacyWebhookHeaders migration",
    );
    this.isAborted = true;
  }
}

async function main() {
  const migration = new EncryptLegacyWebhookHeaders();
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
