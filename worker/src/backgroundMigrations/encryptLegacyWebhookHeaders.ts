import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  createDisplayHeaders,
  encryptSecretHeaders,
  getLegacyOnlyHeaders,
  logger,
} from "@langfuse/shared/src/server";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  isWebhookActionConfig,
  type WebhookActionConfigWithSecrets,
} from "@langfuse/shared";

const BATCH_SIZE = 500;
const MAX_ATTEMPTS_PER_ACTION = 5;

type Outcome = "encrypted" | "unchanged" | "invalid" | "failed";

function hasLegacyHeaders(config: Prisma.JsonValue): boolean {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return false;
  }
  const headers = config.headers;
  return (
    typeof headers === "object" &&
    headers !== null &&
    Object.keys(headers).length > 0
  );
}

function withEncryptedLegacyHeaders(
  config: WebhookActionConfigWithSecrets,
): WebhookActionConfigWithSecrets {
  const legacyHeaders = getLegacyOnlyHeaders(config);
  return {
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
  };
}

async function encryptLegacyHeadersOfAction(action: {
  id: string;
  config: Prisma.JsonValue;
}): Promise<Outcome> {
  let config = action.config;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ACTION; attempt++) {
      if (!hasLegacyHeaders(config)) return "unchanged";
      if (!isWebhookActionConfig(config)) return "invalid";

      const { count } = await prisma.action.updateMany({
        where: { id: action.id, config: { equals: config } },
        data: { config: withEncryptedLegacyHeaders(config) },
      });
      if (count === 1) return "encrypted";

      const current = await prisma.action.findUnique({
        where: { id: action.id },
        select: { config: true },
      });
      if (!current) return "unchanged";
      config = current.config;
    }
  } catch (error) {
    logger.error(
      `[Background Migration] Failed to encrypt legacy webhook headers for action ${action.id}`,
      { error },
    );
  }
  return "failed";
}

async function* webhookActionBatches() {
  let cursor: string | undefined;
  while (true) {
    const actions = await prisma.action.findMany({
      where: { type: "WEBHOOK" },
      select: { id: true, config: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (actions.length === 0) return;
    cursor = actions[actions.length - 1].id;
    yield actions;
  }
}

/**
 * Background migration that encrypts webhook headers stored in the deprecated
 * plaintext `config.headers` field.
 *
 * Legacy headers predate the secret flag and commonly carry credentials. Each
 * one not already overridden by `requestHeaders` is moved into
 * `requestHeaders` as an encrypted secret, its masked value is added to
 * `displayHeaders`, and `headers` is emptied.
 *
 * Rows are written with a compare-and-swap on the whole config, so concurrent
 * writers (form saves, secret rotation, failure tracking) are never
 * overwritten; a lost race re-reads the row and retries. The migration throws
 * if any convertible row is left in plaintext, so it is marked failed rather
 * than finished. It is idempotent and can be safely re-run.
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

    let encrypted = 0;
    const invalidIds: string[] = [];
    const failedIds: string[] = [];

    for await (const actions of webhookActionBatches()) {
      if (this.isAborted) {
        logger.info(
          `[Background Migration] Legacy webhook header encryption aborted after encrypting ${encrypted} actions`,
        );
        return;
      }
      for (const action of actions) {
        const outcome = await encryptLegacyHeadersOfAction(action);
        if (outcome === "encrypted") encrypted++;
        if (outcome === "invalid") invalidIds.push(action.id);
        if (outcome === "failed") failedIds.push(action.id);
      }
    }

    if (invalidIds.length > 0) {
      logger.warn(
        `[Background Migration] Skipped ${invalidIds.length} webhook actions with legacy headers whose config does not parse: ${invalidIds.join(", ")}`,
      );
    }
    logger.info(
      `[Background Migration] Legacy webhook header encryption finished in ${Date.now() - startTime}ms: ` +
        `${encrypted} encrypted, ${invalidIds.length} invalid, ${failedIds.length} failed`,
    );
    if (failedIds.length > 0) {
      throw new Error(
        `Failed to encrypt legacy headers of webhook actions: ${failedIds.join(", ")}`,
      );
    }
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
