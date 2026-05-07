import { z } from "zod";

const base = z.object({
  domain: z.string().refine((v) => v === v.toLowerCase(), {
    message: "Domain must be lowercase",
  }),
});

const tokenEndpointAuthMethod = z
  .enum([
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
    "tls_client_auth",
    "self_signed_tls_client_auth",
    "none",
  ])
  .optional();

const idTokenSignedResponseAlg = z
  .enum([
    "RS256",
    "RS384",
    "RS512",
    "ES256",
    "ES384",
    "ES512",
    "PS256",
    "PS384",
    "PS512",
    "HS256",
    "HS384",
    "HS512",
  ])
  .optional();

// OIDC Discovery (§4) requires the issuer to be served over TLS, and OAuth
// credential exchange likewise cannot ride on HTTP without leaking tokens, so
// every user-supplied URL we build OAuth/OIDC endpoints from must start with
// https://. `z.url()` enforces RFC 3986 grammar so values like `"https://"`
// or `"https:// foo"` don't sneak through and only blow up at sign-in.
const oidcIssuer = z
  .url({ message: "OIDC issuer urls must be a valid URL" })
  .startsWith("https://", {
    message: "OIDC issuer urls must start with https://",
  });

export const GoogleProviderSchema = base.extend({
  authProvider: z.literal("google"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
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
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
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
        baseUrl: z
          .url({ message: "Github Enterprise baseUrls must be a valid URL" })
          .startsWith("https://", {
            message: "Github Enterprise baseUrls must start with https://",
          }),
      }),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
    })
    .nullish(),
});

export const GitlabProviderSchema = base.extend({
  authProvider: z.literal("gitlab"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer.optional(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const Auth0ProviderSchema = base.extend({
  authProvider: z.literal("auth0"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const OktaProviderSchema = base.extend({
  authProvider: z.literal("okta"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const AuthentikProviderSchema = base.extend({
  authProvider: z.literal("authentik"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer.regex(/^https:\/\/.+\/application\/o\/[^/]+$/, {
        message:
          "Authentik issuer must be in format https://<domain>/application/o/<slug> without trailing slash",
      }),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const OneLoginProviderSchema = base.extend({
  authProvider: z.literal("onelogin"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const AzureAdProviderSchema = base.extend({
  authProvider: z.literal("azure-ad"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      // NextAuth interpolates tenantId straight into
      // https://login.microsoftonline.com/<tenantId>/v2.0/...; an empty
      // string saves cleanly and only blows up at sign-in (double slash,
      // no tenant). Same class of footgun as a schemeless issuer URL.
      tenantId: z.string().min(1, {
        message: "Azure AD tenantId is required",
      }),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const CognitoProviderSchema = base.extend({
  authProvider: z.literal("cognito"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const KeycloakProviderSchema = base.extend({
  authProvider: z.literal("keycloak"),
  authConfig: z
    .object({
      name: z.string().optional(),
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const CustomProviderSchema = base.extend({
  authProvider: z.literal("custom"),
  authConfig: z
    .object({
      // Display label rendered as "Display Name" in the form. Surfaced as
      // a required field; reject empty strings so the schema matches the
      // form contract.
      name: z.string().min(1, { message: "Name is required" }),
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      scope: z.string().nullish(),
      idToken: z.boolean().optional().default(true),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
    })
    .nullish(),
});

export const JumpCloudProviderSchema = base.extend({
  authProvider: z.literal("jumpcloud"),
  authConfig: z
    .object({
      clientId: z.string(),
      clientSecret: z.string(),
      issuer: oidcIssuer,
      scope: z.string().nullish(),
      allowDangerousEmailAccountLinking: z.boolean().optional().default(false),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod,
      idTokenSignedResponseAlg: idTokenSignedResponseAlg,
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
export type AuthentikProviderSchema = z.infer<typeof AuthentikProviderSchema>;
export type OneLoginProviderSchema = z.infer<typeof OneLoginProviderSchema>;
export type AzureAdProviderSchema = z.infer<typeof AzureAdProviderSchema>;
export type CognitoProviderSchema = z.infer<typeof CognitoProviderSchema>;
export type KeycloakProviderSchema = z.infer<typeof KeycloakProviderSchema>;
export type CustomProviderSchema = z.infer<typeof CustomProviderSchema>;
export type JumpCloudProviderSchema = z.infer<typeof JumpCloudProviderSchema>;

export const SsoProviderSchema = z.discriminatedUnion("authProvider", [
  GoogleProviderSchema,
  GithubProviderSchema,
  GithubEnterpriseProviderSchema,
  GitlabProviderSchema,
  Auth0ProviderSchema,
  OktaProviderSchema,
  AuthentikProviderSchema,
  OneLoginProviderSchema,
  AzureAdProviderSchema,
  CognitoProviderSchema,
  KeycloakProviderSchema,
  JumpCloudProviderSchema,
  CustomProviderSchema,
]);

export type SsoProviderSchema = z.infer<typeof SsoProviderSchema>;
