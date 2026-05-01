import { getJacksonInstance } from "./samlJacksonService";
import { logger } from "../logger";
import { env } from "../../env";

const PRODUCT = "langfuse";

interface SamlConnectionConfig {
  domain: string;
  authConfig?: {
    metadataUrl?: string;
    metadataRaw?: string;
    name?: string;
    defaultRedirectUrl?: string;
    redirectUrl?: string;
    tenant?: string;
    product?: string;
  } | null;
}

interface SamlConnectionCredentials {
  clientID: string;
  clientSecret: string;
}

/**
 * Creates or updates a SAML connection in Jackson using the IdP metadata
 * provided in the Langfuse SSO config.
 */
export async function createOrUpdateSamlConnection(
  config: SamlConnectionConfig,
): Promise<SamlConnectionCredentials> {
  const jackson = await getJacksonInstance();
  const { connectionAPIController } = jackson;

  const tenant = config.authConfig?.tenant ?? config.domain;
  const product = config.authConfig?.product ?? PRODUCT;
  const nextAuthUrl = env.NEXTAUTH_URL ?? "";

  const defaultRedirectUrl =
    config.authConfig?.defaultRedirectUrl ??
    `${nextAuthUrl}/api/auth/callback/saml-${config.domain}`;

  const redirectUrl = config.authConfig?.redirectUrl ?? defaultRedirectUrl;

  // Check for existing connection first
  const existing = await connectionAPIController.getConnections({
    tenant,
    product,
  });

  const connectionParams = {
    defaultRedirectUrl,
    redirectUrl,
    tenant,
    product,
    name: config.authConfig?.name ?? `SAML SSO for ${config.domain}`,
    ...(config.authConfig?.metadataUrl
      ? { metadataUrl: config.authConfig.metadataUrl }
      : {}),
  };

  if (existing.length > 0 && "clientID" in existing[0]) {
    // Update existing connection
    const record = await connectionAPIController.updateSAMLConnection({
      ...connectionParams,
      clientID: existing[0].clientID,
      clientSecret: existing[0].clientSecret,
      ...(config.authConfig?.metadataRaw
        ? { rawMetadata: config.authConfig.metadataRaw }
        : {}),
    });

    logger.info(`Updated SAML Jackson connection for domain ${config.domain}`);

    return {
      clientID: record.clientID,
      clientSecret: record.clientSecret,
    };
  }

  // Create new connection — requires either rawMetadata or encodedRawMetadata
  if (!config.authConfig?.metadataRaw && !config.authConfig?.metadataUrl) {
    throw new Error(
      `SAML connection for domain ${config.domain} requires either metadataUrl or metadataRaw`,
    );
  }

  const record = await connectionAPIController.createSAMLConnection({
    ...connectionParams,
    rawMetadata: config.authConfig?.metadataRaw ?? "",
    ...(config.authConfig?.metadataUrl
      ? { metadataUrl: config.authConfig.metadataUrl }
      : {}),
  });

  logger.info(
    `Created SAML Jackson connection for domain ${config.domain} (clientID: ${record.clientID})`,
  );

  return {
    clientID: record.clientID,
    clientSecret: record.clientSecret,
  };
}

/**
 * Retrieves the Jackson-generated clientID and clientSecret for a domain's
 * SAML connection.
 */
export async function getSamlConnectionForDomain(
  domain: string,
): Promise<SamlConnectionCredentials | null> {
  try {
    const jackson = await getJacksonInstance();
    const { connectionAPIController } = jackson;

    const connections = await connectionAPIController.getConnections({
      tenant: domain,
      product: PRODUCT,
    });

    if (connections.length === 0) return null;

    const conn = connections[0];
    if (!("clientID" in conn)) return null;

    return {
      clientID: conn.clientID,
      clientSecret: conn.clientSecret,
    };
  } catch (error) {
    logger.error(`Failed to get SAML connection for domain ${domain}`, error);
    return null;
  }
}

/**
 * Deletes the Jackson SAML connection for a domain.
 */
export async function deleteSamlConnection(domain: string): Promise<void> {
  try {
    const jackson = await getJacksonInstance();
    const { connectionAPIController } = jackson;

    await connectionAPIController.deleteConnections({
      tenant: domain,
      product: PRODUCT,
    });

    logger.info(`Deleted SAML Jackson connection for domain ${domain}`);
  } catch (error) {
    logger.error(
      `Failed to delete SAML connection for domain ${domain}`,
      error,
    );
    throw error;
  }
}
