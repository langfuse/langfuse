import { type Provider } from "next-auth/providers/index";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import OktaProvider from "next-auth/providers/okta";
import Auth0Provider from "next-auth/providers/auth0";
import AzureADProvider from "next-auth/providers/azure-ad";

import { isEeAvailable } from "..";
import { prisma, type SsoConfig as DbSsoConfig } from "@langfuse/shared/src/db";
import { z } from "zod";
import { SsoProviderConfig } from "./types";

function getDbSSOConfigs(): Promise<DbSsoConfig[]> {
  // TODO: persist ssoconfigs in memory here to not fetch from db on every auth request
  return prisma.ssoConfig.findMany();
}

export async function loadSsoProviders(): Promise<Provider[]> {
  if (!isEeAvailable) return [];

  const ssoConfigs = await getDbSSOConfigs();

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
  const ssoConfigs = await getDbSSOConfigs();
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
  const ssoConfig = (await getDbSSOConfigs()).find(
    (ssoConfig) => ssoConfig.domain === domain.toLowerCase()
  );

  if (!ssoConfig) return null;
  return getAuthProviderIdForDbSsoConfig(ssoConfig);
}

/**
 * Converts a database SSO configuration to a NextAuth Provider instance.
 *
 * @param {DbSsoConfig} dbSsoConfig - The SSO configuration from the database.
 * @returns {Provider | null} - A NextAuth Provider instance or null if parsing fails or no custom credentials are used for this SSO config.
 */
const dbToNextAuthProvider = (dbSsoConfig: DbSsoConfig): Provider | null => {
  // If the SsoConfig does not use custom credentials, return null as no additional provider needs to be added to NextAuth
  if (!dbSsoConfig.authConfig) return null;

  // Parse the config object
  const config = z
    .record(z.string(), z.any(), {
      invalid_type_error: "SSO config must be Record<string, any>",
    })
    .parse(dbSsoConfig.authConfig);

  let provider: SsoProviderConfig;
  try {
    provider = SsoProviderConfig.parse({
      ...config,
      provider: dbSsoConfig.authProvider,
    });
  } catch (e) {
    console.error(
      `Failed to parse SSO provider config for provider ${dbSsoConfig.domain}`,
      e
    );
    return null;
  }

  if (provider.provider === "google")
    return GoogleProvider({
      id: getAuthProviderIdForDbSsoConfig(dbSsoConfig), // use the domain as the provider id as we use domain-specific credentials
      ...provider,
    });
  else if (provider.provider === "github")
    return GitHubProvider({
      id: getAuthProviderIdForDbSsoConfig(dbSsoConfig), // use the domain as the provider id as we use domain-specific credentials
      ...provider,
    });
  else if (provider.provider === "auth0")
    return Auth0Provider({
      id: getAuthProviderIdForDbSsoConfig(dbSsoConfig), // use the domain as the provider id as we use domain-specific credentials
      ...provider,
    });
  else if (provider.provider === "okta")
    return OktaProvider({
      id: getAuthProviderIdForDbSsoConfig(dbSsoConfig), // use the domain as the provider id as we use domain-specific credentials
      ...provider,
    });
  else if (provider.provider === "azure-ad")
    return AzureADProvider({
      id: getAuthProviderIdForDbSsoConfig(dbSsoConfig), // use the domain as the provider id as we use domain-specific credentials
      ...provider,
    });
  else {
    // Type check to ensure we handle all providers
    // eslint-disable-next-line no-unused-vars
    const _: never = provider;
    throw new Error(
      `Unrecognized SSO provider for domain ${dbSsoConfig.domain}`
    );
  }
};

/**
 * Get the custom SSO providerId for a database SSO configuration. To be used with NextAuth's `signIn(providerId)`.
 *
 * @param {DbSsoConfig} dbSsoConfig - The SSO configuration from the database.
 * @returns {string} - The providerId used in NextAuth.
 */
const getAuthProviderIdForDbSsoConfig = (dbSsoConfig: DbSsoConfig): string => {
  if (!dbSsoConfig.authConfig) return dbSsoConfig.authProvider;
  return `${dbSsoConfig.domain.toLowerCase()}.${dbSsoConfig.authProvider}`;
};
