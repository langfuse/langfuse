import { env } from "../../env";
import { logger } from "../logger";

import type { SAMLJackson } from "@boxyhq/saml-jackson";

let jacksonInstance: SAMLJackson | null = null;
let initPromise: Promise<SAMLJackson> | null = null;

/**
 * Lazily initializes and returns a singleton Jackson controller instance.
 *
 * Jackson manages its own tables in Postgres (prefixed, no conflict with
 * Prisma-managed tables). These tables are created on first initialization
 * and are NOT managed by `prisma migrate`.
 */
export async function getJacksonInstance(): Promise<SAMLJackson> {
  if (jacksonInstance) return jacksonInstance;

  // Avoid concurrent initialization
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { controllers } = await import("@boxyhq/saml-jackson");

      const externalUrl = env.NEXTAUTH_URL;
      if (!externalUrl) {
        throw new Error(
          "NEXTAUTH_URL must be set for SAML SSO (used as external URL for Jackson)",
        );
      }

      const encryptionKey = env.ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error(
          "ENCRYPTION_KEY must be set for SAML SSO (used as Jackson DB encryption key)",
        );
      }

      const databaseUrl = env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error(
          "DATABASE_URL must be set for SAML SSO (used by Jackson for connection storage)",
        );
      }

      const product = "langfuse";

      const instance = await controllers({
        externalUrl,
        samlPath: "/api/auth/saml/callback",
        samlAudience: `${externalUrl}/api/auth/saml/metadata`,
        idpEnabled: true,
        db: {
          engine: "sql",
          type: "postgres",
          url: databaseUrl,
          // Jackson's encrypter passes the key directly to createCipheriv,
          // which expects 32 raw bytes for AES-256. Langfuse's ENCRYPTION_KEY
          // is a 64-char hex string — decode it to a 32-byte Buffer.
          encryptionKey: Buffer.from(encryptionKey, "hex").toString("latin1"),
        },
        openid: {
          // Use default JWS algorithm
          requestProfileScope: true,
        },
        noAnalytics: true,
        logger: {
          info: (msg: string) => logger.info(`[saml-jackson] ${msg}`),
          warn: (msg: string) => logger.warn(`[saml-jackson] ${msg}`),
          error: (msg: string, err?: unknown) =>
            logger.error(`[saml-jackson] ${msg}`, err),
        },
      });

      jacksonInstance = instance;
      logger.info(
        `SAML Jackson initialized successfully (product: ${product})`,
      );
      return instance;
    } catch (error) {
      initPromise = null; // Allow retry on failure
      logger.error("Failed to initialize SAML Jackson", error);
      throw error;
    }
  })();

  return initPromise;
}
