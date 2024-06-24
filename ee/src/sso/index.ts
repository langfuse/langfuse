import { type Provider } from "next-auth/providers/index";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import OktaProvider from "next-auth/providers/okta";
import CognitoProvider from "next-auth/providers/cognito";
import Auth0Provider from "next-auth/providers/auth0";
import AzureADProvider from "next-auth/providers/azure-ad";
import { isEeAvailable } from "..";
import { type SsoConfig, prisma } from "@langfuse/shared/src/db";
import { encrypt, decrypt } from "@langfuse/shared/encryption";
import { SsoProviderSchema } from "./types";
import { type NextApiRequest, type NextApiResponse } from "next";
import { env } from "../env";
import { CustomSSOProvider } from "@langfuse/shared/src/server";

// Local cache for SSO configurations
let cachedSsoConfigs: {
  data: SsoProviderSchema[];
  timestamp: number;
} | null = null;

/**
 * Get all SSO configurations from the database or from local cache and parse them into SsoProviderSchema objects.
 *
 * @returns {Promise<SsoProviderSchema[]>} - A list of all SSO configurations. Empty array if none are configured or EE is not available.
 */
async function getSsoConfigs(): Promise<SsoProviderSchema[]> {
  if (!isEeAvailable) return [];
  const CACHE_TTL = 60 * 1000; // 1 minute
  const DB_MAX_WAIT = 2000; // 2 seconds
  const DB_TIMEOUT = 3000; // 3 seconds

  // Set/refresh the cache if it's empty or expired
  if (
    cachedSsoConfigs === null ||
    Date.now() - cachedSsoConfigs.timestamp > CACHE_TTL
  ) {
    // findMany with custom timeout via $transaction
    let dbConfigs: SsoConfig[] = [];
    try {
      dbConfigs = await prisma.$transaction(
        async (prisma) => prisma.ssoConfig.findMany(),
        {
          maxWait: DB_MAX_WAIT,
          timeout: DB_TIMEOUT,
        }
      );
    } catch (e) {
      // cache empty array to prevent repeated DB calls on error
      cachedSsoConfigs = {
        data: [],
        timestamp: Date.now(),
      };

      // caught and logged in the caller
      throw e;
    }

    // transform into zod object
    const parsedSsoConfigs = dbConfigs
      .map((v) => {
        try {
          const parsedValue = SsoProviderSchema.parse(v);
          return parsedValue;
        } catch (e) {
          console.error(
            `Failed to parse SSO provider config for domain ${v.domain}`,
            e
          );
          return null;
        }
      })
      .filter((parsed) => parsed !== null) as SsoProviderSchema[];

    cachedSsoConfigs = {
      data: parsedSsoConfigs,
      timestamp: Date.now(),
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
  if (!isEeAvailable) return [];

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
  if (!isEeAvailable) return false;
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
  domain: string
): Promise<string | null> {
  if (!isEeAvailable) return null;
  const ssoConfig = (await getSsoConfigs()).find(
    (ssoConfig) => ssoConfig.domain === domain.toLowerCase()
  );

  if (!ssoConfig) return null;
  return getAuthProviderIdForSsoConfig(ssoConfig);
}

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
    });
  else if (provider.authProvider === "github")
    return GitHubProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else if (provider.authProvider === "auth0")
    return Auth0Provider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else if (provider.authProvider === "okta")
    return OktaProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else if (provider.authProvider === "azure-ad")
    return AzureADProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else if (provider.authProvider === "cognito")
    return CognitoProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else if (provider.authProvider === "custom")
    return CustomSSOProvider({
      id: getAuthProviderIdForSsoConfig(provider), // use the domain as the provider id as we use domain-specific credentials
      ...provider.authConfig,
      clientSecret: decrypt(provider.authConfig.clientSecret),
    });
  else {
    // Type check to ensure we handle all providers
    // eslint-disable-next-line no-unused-vars
    const _: never = provider;
    throw new Error(
      `Unrecognized SSO provider for domain ${(provider as any).domain}`
    );
  }
};

/**
 * Get the custom SSO providerId for a database SSO configuration. To be used with NextAuth's `signIn(providerId)`.
 *
 * @param {DbSsoConfig} dbSsoConfig - The SSO configuration from the database.
 * @returns {string} - The providerId used in NextAuth.
 */
const getAuthProviderIdForSsoConfig = (
  dbSsoConfig: SsoProviderSchema
): string => {
  if (!dbSsoConfig.authConfig) return dbSsoConfig.authProvider;
  return `${dbSsoConfig.domain}.${dbSsoConfig.authProvider}`;
};

export async function createNewSsoConfigHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (!isEeAvailable) {
      res.status(403).json({ error: "EE is not available" });
      return;
    }
    // allow only POST requests
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    // check if ADMIN_API_KEY is set
    if (!env.ADMIN_API_KEY) {
      res.status(500).json({ error: "ADMIN_API_KEY is not set" });
      return;
    }
    if (!env.ENCRYPTION_KEY) {
      res.status(500).json({ error: "ENCRYPTION_KEY is not set" });
      return;
    }
    // check bearer token
    const { authorization } = req.headers;
    if (!authorization) {
      res
        .status(401)
        .json({ error: "Unauthorized: No authorization header provided" });
      return;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token || token !== env.ADMIN_API_KEY) {
      res.status(401).json({ error: "Unauthorized: Invalid token" });
      return;
    }

    const body = SsoProviderSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error });
      return;
    }

    const { domain, authProvider, authConfig } = body.data;

    const encryptedClientSecret = authConfig
      ? {
          ...authConfig,
          clientSecret: encrypt(authConfig.clientSecret),
        }
      : undefined;

    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider,
        authConfig: encryptedClientSecret,
      },
    });
    res.status(201).json({
      message: "SSO configuration created successfully",
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
