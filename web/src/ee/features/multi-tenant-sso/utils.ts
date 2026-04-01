import { type Provider } from "next-auth/providers/index";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import GitLabProvider from "next-auth/providers/gitlab";
import OktaProvider from "next-auth/providers/okta";
import AuthentikProvider from "next-auth/providers/authentik";
import OneLoginProvider from "next-auth/providers/onelogin";
import CognitoProvider from "next-auth/providers/cognito";
import KeycloakProvider from "next-auth/providers/keycloak";
import Auth0Provider from "next-auth/providers/auth0";
import AzureADProvider from "next-auth/providers/azure-ad";
import { multiTenantSsoAvailable } from "@/src/ee/features/multi-tenant-sso/multiTenantSsoAvailable";
import { type SsoConfig, prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { SsoProviderSchema } from "./types";
import {
  CustomSSOProvider,
  GitHubEnterpriseProvider,
  JumpCloudProvider,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

// Local cache for SSO configurations
let cachedSsoConfigs: {
  data: SsoProviderSchema[];
  failedToFetch: boolean;
  timestamp: number;
} =
  // initialize with empty cache
  { data: [], failedToFetch: false, timestamp: 0 };

/**
 * Get all SSO configurations from the database or from local cache and parse them into SsoProviderSchema objects.
 *
 * @returns {Promise<SsoProviderSchema[]>} - A list of all SSO configurations. Empty array if none are configured or EE is not available.
 */
async function getSsoConfigs(): Promise<SsoProviderSchema[]> {
  if (!multiTenantSsoAvailable) return [];

  const CACHE_TTL = 60 * 60 * 1000; // 1 hour
  const FAILEDTOFETCH_RETRY_AFTER = 60 * 1000; // 1 minute
  const DB_MAX_WAIT = 2 * 1000; // 2 seconds
  const DB_TIMEOUT = 3 * 1000; // 3 seconds

  const isCacheExpired =
    Date.now() - cachedSsoConfigs.timestamp >
    (cachedSsoConfigs.failedToFetch ? FAILEDTOFETCH_RETRY_AFTER : CACHE_TTL);

  if (isCacheExpired) {
    // findMany with custom timeout via $transaction
    let dbConfigs: SsoConfig[] = [];
    let failedToFetch = false;
    try {
      dbConfigs = await prisma.$transaction(
        async (prisma) => prisma.ssoConfig.findMany(),
        {
          maxWait: DB_MAX_WAIT,
          timeout: DB_TIMEOUT,
        },
      );
    } catch (e) {
      logger.error("Failed to load SSO configs from the database", e);
      traceException(e);
      // empty array will be cached to prevent repeated DB queries
      failedToFetch = true;
    }

    // transform into zod object
    const parsedSsoConfigs = dbConfigs
      .map((v) => {
        try {
          const parsedValue = SsoProviderSchema.parse(v);
          return parsedValue;
        } catch (e) {
          logger.error(
            `Failed to parse SSO provider config for domain ${v.domain}`,
            e,
          );

          traceException(e);
          return null;
        }
      })
      .filter((parsed): parsed is SsoProviderSchema => parsed !== null);

    cachedSsoConfigs = {
      data: parsedSsoConfigs,
      timestamp: Date.now(),
      failedToFetch,
    };
  }

  return cachedSsoConfigs.data;
}

/**
 * Load all custom SSO providers from the database. To be used within `providers` in NextAuth backend configuration.
 *
 * @returns {Promise<Provider[]>} - A list of all custom SSO providers.
 */
export async function loadSsoProviders(): Promise<Provider[]> {
  if (!multiTenantSsoAvailable) return [];

  const ssoConfigs = await getSsoConfigs();

  const providers: Provider[] = [];

  for (const dbSsoConfig of ssoConfigs) {
    const provider = dbToNextAuthProvider(dbSsoConfig);
    if (provider !== null) providers.push(provider);
  }

  return providers;
}

/**
 * @returns `true` if any custom SSO provider is configured in the database.
 */
export async function isAnySsoConfigured(): Promise<boolean> {
  if (!multiTenantSsoAvailable) return false;
  const ssoConfigs = await getSsoConfigs();
  return ssoConfigs.length > 0;
}

/**
 * Get the custom SSO providerId for a domain. To be used with NextAuth's `signIn(providerId)`.
 *
 * @param domain - The domain to check for a custom SSO provider, e.g. "example.com".
 * @returns `providerId` or null if none is configured or EE is not available.
 */
export async function getSsoAuthProviderIdForDomain(
  domain: string,
): Promise<string | null> {
  if (!multiTenantSsoAvailable) return null;
  const ssoConfig = (await getSsoConfigs()).find(
    (ssoConfig) => ssoConfig.domain === domain.toLowerCase(),
  );

  if (!ssoConfig) return null;
  return getAuthProviderIdForSsoConfig(ssoConfig);
}

type TokenEndpointAuthMethod =
  | "client_secret_basic"
  | "client_secret_post"
  | "client_secret_jwt"
  | "private_key_jwt"
  | "tls_client_auth"
  | "self_signed_tls_client_auth"
  | "none";

/**
 * Returns the NextAuth `client` config for token endpoint auth method if configured.
 */
const getClientConfig = (authConfig: {
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
}):
  | { client: { token_endpoint_auth_method: TokenEndpointAuthMethod } }
  | Record<string, never> =>
  authConfig.tokenEndpointAuthMethod
    ? {
        client: {
          token_endpoint_auth_method: authConfig.tokenEndpointAuthMethod,
        },
      }
    : {};

/**
 * Converts a SsoProviderConfig to a NextAuth Provider instance.
 *
 * @param {SsoProviderSchema} provider - The SSO configuration from the database.
 * @returns {Provider | null} - A NextAuth Provider instance or null if parsing fails or no custom credentials are used for this SSO config.
 */
const dbToNextAuthProvider = (provider: SsoProviderSchema): Provider | null => {
  // If the SsoConfig does not use custom credentials, return null as no additional provider needs to be added to NextAuth
  if (!provider.authConfig) return null;

  if (provider.authProvider === "google")
    return GoogleProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "github")
    return GitHubProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "gitlab")
    return GitLabProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "auth0")
    return Auth0Provider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "okta")
    return OktaProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "authentik")
    return AuthentikProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "onelogin")
    return OneLoginProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "azure-ad")
    return AzureADProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "cognito")
    return CognitoProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "keycloak")
    return KeycloakProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "custom")
    return CustomSSOProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      authorization: {
        params: { scope: provider.authConfig.scope ?? "openid email profile" },
      },
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "github-enterprise")
    return GitHubEnterpriseProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      enterprise: {
        baseUrl: provider.authConfig.enterprise.baseUrl,
      },
      ...getClientConfig(provider.authConfig),
    });
  else if (provider.authProvider === "jumpcloud")
    return JumpCloudProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
      authorization: {
        params: { scope: provider.authConfig.scope ?? "openid profile email" },
      },
      ...getClientConfig(provider.authConfig),
    });
  else {
    // Type check to ensure we handle all providers

    const _: never = provider;
    logger.error(
      `Unrecognized SSO provider for domain ${(provider as any).domain}`,
    );
    traceException(
      new Error(
        `Unrecognized SSO provider for domain ${(provider as any).domain}`,
      ),
    );
    return null;
  }
};

/**
 * Get the custom SSO providerId for a database SSO configuration. To be used with NextAuth's `signIn(providerId)`.
 *
 * @param {DbSsoConfig} dbSsoConfig - The SSO configuration from the database.
 * @returns {string} - The providerId used in NextAuth.
 */
const getAuthProviderIdForSsoConfig = (
  dbSsoConfig: SsoProviderSchema,
): string => {
  if (!dbSsoConfig.authConfig) return dbSsoConfig.authProvider;
  return `${dbSsoConfig.domain}.${dbSsoConfig.authProvider}`;
};

export const findMultiTenantSsoConfig = async ({
  providerId,
}: {
  providerId: string;
}): Promise<
  | {
      isMultiTenantSsoProvider: true;
      domain: string;
    }
  | {
      isMultiTenantSsoProvider: false;
      domain: null;
    }
> => {
  const allConfigs = await getSsoConfigs();

  const config = allConfigs
    .filter((config) => Boolean(config.authConfig)) // exclude all that don't use custom credentials (enforcement of social login)
    .find((c) => getAuthProviderIdForSsoConfig(c) === providerId);

  if (config) {
    return { isMultiTenantSsoProvider: true, domain: config.domain };
  } else {
    return { isMultiTenantSsoProvider: false, domain: null };
  }
};
