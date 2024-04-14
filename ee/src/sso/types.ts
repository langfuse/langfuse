import { z } from "zod";

export const GoogleProviderConfig = z.object({
  provider: z.literal("google"),
  clientId: z.string(),
  clientSecret: z.string(),
  allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
});

export const GithubProviderConfig = z.object({
  provider: z.literal("github"),
  clientId: z.string(),
  clientSecret: z.string(),
  allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
});

export const Auth0ProviderConfig = z.object({
  provider: z.literal("auth0"),
  clientId: z.string(),
  clientSecret: z.string(),
  issuer: z.string(),
  allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
});

export const OktaProviderConfig = z.object({
  provider: z.literal("okta"),
  clientId: z.string(),
  clientSecret: z.string(),
  issuer: z.string(),
  allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
});

export const AzureAdProviderConfig = z.object({
  provider: z.literal("azure-ad"),
  clientId: z.string(),
  clientSecret: z.string(),
  tenantId: z.string(),
  allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
});

export type GoogleProviderConfig = z.infer<typeof GoogleProviderConfig>;
export type GithubProviderConfig = z.infer<typeof GithubProviderConfig>;
export type Auth0ProviderConfig = z.infer<typeof Auth0ProviderConfig>;
export type OktaProviderConfig = z.infer<typeof OktaProviderConfig>;
export type AzureAdProviderConfig = z.infer<typeof AzureAdProviderConfig>;

export const SsoProviderConfig = z.discriminatedUnion("provider", [
  GoogleProviderConfig,
  GithubProviderConfig,
  Auth0ProviderConfig,
  OktaProviderConfig,
  AzureAdProviderConfig,
]);

export type SsoProviderConfig = z.infer<typeof SsoProviderConfig>;
