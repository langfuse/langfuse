import { z } from "zod";

// OAuth2 client credentials provider profiles for LLM connections.
// Pure module (zod only): imported by the server token client and by the
// web client bundle to render the connection form.

export const OAUTH2_PROVIDERS = [
  "entra",
  "okta",
  "auth0",
  "cognito",
  "keycloak",
  "onelogin",
  "workos",
  "authentik",
  "custom",
] as const;
export type OAuth2Provider = (typeof OAUTH2_PROVIDERS)[number];

export const OAUTH2_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
] as const;
export type OAuth2AuthMethod = (typeof OAUTH2_AUTH_METHODS)[number];

export const CLIENT_SECRET_JWT_ALGORITHMS = [
  "HS256",
  "HS384",
  "HS512",
] as const;
export const PRIVATE_KEY_JWT_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
] as const;

// Allowed methods per provider; the first entry is the UI default.
const PROVIDER_AUTH_METHODS = {
  entra: ["client_secret_post", "client_secret_basic", "private_key_jwt"],
  okta: [
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
  ],
  auth0: ["client_secret_post", "client_secret_basic", "private_key_jwt"],
  cognito: ["client_secret_basic", "client_secret_post"],
  keycloak: [
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
  ],
  onelogin: ["client_secret_basic", "client_secret_post"],
  workos: ["client_secret_post"],
  authentik: ["client_secret_post"],
  custom: [
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
  ],
} as const satisfies Record<OAuth2Provider, readonly OAuth2AuthMethod[]>;

// Hosts are entered without scheme or path and are always built as https://.
const hostSchema = z.string().regex(/^[a-z0-9.-]+$/i);
const urlSchema = z.url({ protocol: /^https?$/ });
const requiredString = z.string().min(1);
const optionalString = z.string().min(1).optional();
const assertionAlgorithmSchema = z
  .enum([...CLIENT_SECRET_JWT_ALGORITHMS, ...PRIVATE_KEY_JWT_ALGORITHMS])
  .optional();

export const OAuth2ConfigSchema = z
  .discriminatedUnion("provider", [
    z
      .object({
        provider: z.literal("entra"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.entra),
        tenantId: requiredString,
        scope: requiredString,
        assertionAlgorithm: assertionAlgorithmSchema,
      })
      .strict(),
    z
      .object({
        provider: z.literal("okta"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.okta),
        domain: hostSchema,
        authorizationServerId: optionalString,
        scope: requiredString,
        assertionAlgorithm: assertionAlgorithmSchema,
      })
      .strict(),
    z
      .object({
        provider: z.literal("auth0"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.auth0),
        domain: hostSchema,
        audience: requiredString,
        assertionAlgorithm: assertionAlgorithmSchema,
      })
      .strict(),
    z
      .object({
        provider: z.literal("cognito"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.cognito),
        domain: hostSchema,
        scope: optionalString,
      })
      .strict(),
    z
      .object({
        provider: z.literal("keycloak"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.keycloak),
        baseUrl: urlSchema,
        realm: requiredString,
        scope: optionalString,
        assertionAlgorithm: assertionAlgorithmSchema,
      })
      .strict(),
    z
      .object({
        provider: z.literal("onelogin"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.onelogin),
        subdomain: hostSchema,
        scope: optionalString,
        resource: optionalString,
      })
      .strict(),
    z
      .object({
        provider: z.literal("workos"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.workos),
        domain: hostSchema,
        scope: optionalString,
      })
      .strict(),
    z
      .object({
        provider: z.literal("authentik"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.authentik),
        baseUrl: urlSchema,
        scope: optionalString,
      })
      .strict(),
    z
      .object({
        provider: z.literal("custom"),
        clientId: requiredString,
        authMethod: z.enum(PROVIDER_AUTH_METHODS.custom),
        tokenEndpoint: urlSchema,
        scope: optionalString,
        audience: optionalString,
        resource: optionalString,
        assertionAudience: optionalString,
        sendClientIdWithAssertion: z.boolean().optional(),
        assertionAlgorithm: assertionAlgorithmSchema,
      })
      .strict(),
  ])
  .superRefine((config, ctx) => {
    if (!("assertionAlgorithm" in config) || !config.assertionAlgorithm) {
      return;
    }
    const allowedByMethod: Partial<
      Record<OAuth2AuthMethod, readonly string[]>
    > = {
      client_secret_jwt: CLIENT_SECRET_JWT_ALGORITHMS,
      private_key_jwt: PRIVATE_KEY_JWT_ALGORITHMS,
    };
    const allowed = allowedByMethod[config.authMethod] ?? [];
    if (!allowed.includes(config.assertionAlgorithm)) {
      ctx.addIssue({
        code: "custom",
        path: ["assertionAlgorithm"],
        message:
          allowed.length === 0
            ? "assertionAlgorithm is only valid with client_secret_jwt or private_key_jwt"
            : `assertionAlgorithm must be one of ${allowed.join(", ")} for ${config.authMethod}`,
      });
    }
  });
export type OAuth2Config = z.infer<typeof OAuth2ConfigSchema>;

export type OAuth2ProfileField = {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
};

export const OAUTH2_PROVIDER_PROFILES: Record<
  OAuth2Provider,
  {
    label: string;
    authMethods: readonly OAuth2AuthMethod[];
    fields: readonly OAuth2ProfileField[];
  }
> = {
  entra: {
    label: "Microsoft Entra ID",
    authMethods: PROVIDER_AUTH_METHODS.entra,
    fields: [
      {
        key: "tenantId",
        label: "Tenant ID",
        required: true,
        placeholder: "00000000-0000-0000-0000-000000000000",
      },
      {
        key: "scope",
        label: "Scope",
        required: true,
        placeholder: "api://<app-id>/.default",
      },
    ],
  },
  okta: {
    label: "Okta",
    authMethods: PROVIDER_AUTH_METHODS.okta,
    fields: [
      {
        key: "domain",
        label: "Domain",
        required: true,
        placeholder: "acme.okta.com",
      },
      {
        key: "authorizationServerId",
        label: "Authorization server ID",
        required: false,
        defaultValue: "default",
      },
      { key: "scope", label: "Scope", required: true },
    ],
  },
  auth0: {
    label: "Auth0",
    authMethods: PROVIDER_AUTH_METHODS.auth0,
    fields: [
      {
        key: "domain",
        label: "Domain",
        required: true,
        placeholder: "acme.eu.auth0.com",
      },
      {
        key: "audience",
        label: "Audience",
        required: true,
        placeholder: "https://gateway.acme.com",
      },
    ],
  },
  cognito: {
    label: "Amazon Cognito",
    authMethods: PROVIDER_AUTH_METHODS.cognito,
    fields: [
      {
        key: "domain",
        label: "Domain",
        required: true,
        placeholder: "acme.auth.eu-west-1.amazoncognito.com",
      },
      { key: "scope", label: "Scope", required: false },
    ],
  },
  keycloak: {
    label: "Keycloak",
    authMethods: PROVIDER_AUTH_METHODS.keycloak,
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        required: true,
        placeholder: "https://keycloak.acme.com",
      },
      { key: "realm", label: "Realm", required: true },
      { key: "scope", label: "Scope", required: false },
    ],
  },
  onelogin: {
    label: "OneLogin",
    authMethods: PROVIDER_AUTH_METHODS.onelogin,
    fields: [
      {
        key: "subdomain",
        label: "Subdomain",
        required: true,
        placeholder: "acme",
      },
      { key: "scope", label: "Scope", required: false },
      { key: "resource", label: "Resource", required: false },
    ],
  },
  workos: {
    label: "WorkOS",
    authMethods: PROVIDER_AUTH_METHODS.workos,
    fields: [
      {
        key: "domain",
        label: "AuthKit domain",
        required: true,
        placeholder: "auth.acme.com",
      },
      { key: "scope", label: "Scope", required: false },
    ],
  },
  authentik: {
    label: "authentik",
    authMethods: PROVIDER_AUTH_METHODS.authentik,
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        required: true,
        placeholder: "https://authentik.acme.com",
      },
      { key: "scope", label: "Scope", required: false },
    ],
  },
  custom: {
    label: "Custom",
    authMethods: PROVIDER_AUTH_METHODS.custom,
    fields: [
      {
        key: "tokenEndpoint",
        label: "Token endpoint",
        required: true,
        placeholder: "https://idp.acme.com/oauth2/token",
      },
      { key: "scope", label: "Scope", required: false },
      { key: "audience", label: "Audience", required: false },
      { key: "resource", label: "Resource", required: false },
      {
        key: "assertionAudience",
        label: "Assertion audience",
        required: false,
        placeholder: "Defaults to the token endpoint",
      },
    ],
  },
};

export type ResolvedOAuth2Profile = {
  provider: OAuth2Provider;
  tokenEndpoint: string;
  clientId: string;
  authMethod: OAuth2AuthMethod;
  assertionAudience: string;
  sendClientIdWithAssertion: boolean;
  // scope / audience / resource, only keys that are set
  formParams: Record<string, string>;
  // explicit config value only
  assertionAlgorithm?: string;
  defaultRsaAlgorithm: "RS256" | "PS256";
  requireX5tS256: boolean;
};

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const definedParams = (
  params: Record<string, string | undefined>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
};

type EndpointShape = Pick<
  ResolvedOAuth2Profile,
  "tokenEndpoint" | "assertionAudience" | "formParams"
> &
  Partial<
    Pick<
      ResolvedOAuth2Profile,
      "sendClientIdWithAssertion" | "defaultRsaAlgorithm" | "requireX5tS256"
    >
  >;

const resolveEndpoint = (config: OAuth2Config): EndpointShape => {
  switch (config.provider) {
    case "entra": {
      const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: { scope: config.scope },
        sendClientIdWithAssertion: true,
        defaultRsaAlgorithm: "PS256",
        requireX5tS256: true,
      };
    }
    case "okta": {
      const serverId = encodeURIComponent(
        config.authorizationServerId ?? "default",
      );
      const tokenEndpoint = `https://${config.domain}/oauth2/${serverId}/v1/token`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: { scope: config.scope },
      };
    }
    case "auth0":
      return {
        tokenEndpoint: `https://${config.domain}/oauth/token`,
        assertionAudience: `https://${config.domain}/`,
        formParams: { audience: config.audience },
      };
    case "cognito": {
      const tokenEndpoint = `https://${config.domain}/oauth2/token`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: definedParams({ scope: config.scope }),
      };
    }
    case "keycloak": {
      const issuer = `${stripTrailingSlashes(config.baseUrl)}/realms/${encodeURIComponent(config.realm)}`;
      return {
        tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
        assertionAudience: issuer,
        formParams: definedParams({ scope: config.scope }),
      };
    }
    case "onelogin": {
      const tokenEndpoint = `https://${config.subdomain}.onelogin.com/oidc/2/token`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: definedParams({
          scope: config.scope,
          resource: config.resource,
        }),
      };
    }
    case "workos": {
      const tokenEndpoint = `https://${config.domain}/oauth2/token`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: definedParams({ scope: config.scope }),
      };
    }
    case "authentik": {
      const tokenEndpoint = `${stripTrailingSlashes(config.baseUrl)}/application/o/token/`;
      return {
        tokenEndpoint,
        assertionAudience: tokenEndpoint,
        formParams: definedParams({ scope: config.scope }),
      };
    }
    case "custom":
      return {
        tokenEndpoint: config.tokenEndpoint,
        assertionAudience: config.assertionAudience ?? config.tokenEndpoint,
        formParams: definedParams({
          scope: config.scope,
          audience: config.audience,
          resource: config.resource,
        }),
        sendClientIdWithAssertion: config.sendClientIdWithAssertion ?? false,
      };
  }
};

export function resolveOAuth2Profile(
  config: OAuth2Config,
): ResolvedOAuth2Profile {
  const endpoint = resolveEndpoint(config);
  return {
    provider: config.provider,
    clientId: config.clientId,
    authMethod: config.authMethod,
    tokenEndpoint: endpoint.tokenEndpoint,
    assertionAudience: endpoint.assertionAudience,
    formParams: endpoint.formParams,
    sendClientIdWithAssertion: endpoint.sendClientIdWithAssertion ?? false,
    defaultRsaAlgorithm: endpoint.defaultRsaAlgorithm ?? "RS256",
    requireX5tS256: endpoint.requireX5tS256 ?? false,
    ...("assertionAlgorithm" in config && config.assertionAlgorithm
      ? { assertionAlgorithm: config.assertionAlgorithm }
      : {}),
  };
}

export function isOAuth2Config(
  config: unknown,
): config is { oauth2: OAuth2Config } {
  return (
    typeof config === "object" &&
    config !== null &&
    "oauth2" in config &&
    OAuth2ConfigSchema.safeParse(config.oauth2).success
  );
}
