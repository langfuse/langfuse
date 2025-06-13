import { z } from "zod/v4";

const base = z.object({
  domain: z.string().refine((v) => v === v.toLowerCase(), {
    message: "Domain must be lowercase",
  }),
});

export const GoogleProviderSchema = base.extend({
  authProvider: z.literal("google"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const GithubProviderSchema = base.extend({
  authProvider: z.literal("github"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const GithubEnterpriseProviderSchema = base.extend({
  authProvider: z.literal("github-enterprise"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      enterprise: z.object({
        baseUrl: z.string().url(),
      }),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const GitlabProviderSchema = base.extend({
  authProvider: z.literal("gitlab"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string().optional(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const Auth0ProviderSchema = base.extend({
  authProvider: z.literal("auth0"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const OktaProviderSchema = base.extend({
  authProvider: z.literal("okta"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const AzureAdProviderSchema = base.extend({
  authProvider: z.literal("azure-ad"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      tenantId: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const CognitoProviderSchema = base.extend({
  authProvider: z.literal("cognito"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const KeycloakProviderSchema = base.extend({
  authProvider: z.literal("keycloak"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export const CustomProviderSchema = base.extend({
  authProvider: z.literal("custom"),
  authConfig: z
    .object({
      name: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: z.string(),
      scope: z.string().nullish(),
      idToken: z.boolean().optional().default(true),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
    })
    .nullish(),
});

export type GoogleProviderSchema = z.infer<typeof GoogleProviderSchema>;
export type GithubProviderSchema = z.infer<typeof GithubProviderSchema>;
export type GithubEnterpriseProviderSchema = z.infer<
  typeof GithubEnterpriseProviderSchema
>;
export type GitlabProviderSchema = z.infer<typeof GitlabProviderSchema>;
export type Auth0ProviderSchema = z.infer<typeof Auth0ProviderSchema>;
export type OktaProviderSchema = z.infer<typeof OktaProviderSchema>;
export type AzureAdProviderSchema = z.infer<typeof AzureAdProviderSchema>;
export type CognitoProviderSchema = z.infer<typeof CognitoProviderSchema>;
export type KeycloakProviderSchema = z.infer<typeof KeycloakProviderSchema>;
export type CustomProviderSchema = z.infer<typeof CustomProviderSchema>;

export const SsoProviderSchema = z.discriminatedUnion("authProvider", [
  GoogleProviderSchema,
  GithubProviderSchema,
  GithubEnterpriseProviderSchema,
  GitlabProviderSchema,
  Auth0ProviderSchema,
  OktaProviderSchema,
  AzureAdProviderSchema,
  CognitoProviderSchema,
  KeycloakProviderSchema,
  CustomProviderSchema,
]);

export type SsoProviderSchema = z.infer<typeof SsoProviderSchema>;
