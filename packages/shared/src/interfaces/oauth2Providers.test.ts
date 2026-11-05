import { describe, expect, it } from "vitest";
import { LLMAdapter, LLMApiKeySchema } from "../server/llm/types";
import {
  AnthropicConfigSchema,
  LLMConnectionConfigSchema,
  OpenAIConfigSchema,
} from "./customLLMProviderConfigSchemas";
import {
  OAUTH2_PROVIDER_PROFILES,
  OAUTH2_PROVIDERS,
  OAuth2ConfigSchema,
  isOAuth2Config,
  resolveOAuth2Profile,
  type OAuth2Config,
  type ResolvedOAuth2Profile,
} from "./oauth2Providers";

const entraConfig = {
  provider: "entra",
  clientId: "c1",
  authMethod: "client_secret_post",
  tenantId: "t1",
  scope: "api://x/.default",
} as const satisfies OAuth2Config;

describe("resolveOAuth2Profile", () => {
  it.each<[string, OAuth2Config, Partial<ResolvedOAuth2Profile>]>([
    [
      "entra",
      entraConfig,
      {
        tokenEndpoint: "https://login.microsoftonline.com/t1/oauth2/v2.0/token",
        assertionAudience:
          "https://login.microsoftonline.com/t1/oauth2/v2.0/token",
        sendClientIdWithAssertion: true,
        requireX5tS256: true,
        defaultRsaAlgorithm: "PS256",
        formParams: { scope: "api://x/.default" },
      },
    ],
    [
      "okta",
      {
        provider: "okta",
        clientId: "c1",
        authMethod: "client_secret_basic",
        domain: "acme.okta.com",
        scope: "llm.invoke",
      },
      {
        tokenEndpoint: "https://acme.okta.com/oauth2/default/v1/token",
        assertionAudience: "https://acme.okta.com/oauth2/default/v1/token",
        sendClientIdWithAssertion: false,
        requireX5tS256: false,
        defaultRsaAlgorithm: "RS256",
        formParams: { scope: "llm.invoke" },
      },
    ],
    [
      "auth0",
      {
        provider: "auth0",
        clientId: "c1",
        authMethod: "client_secret_post",
        domain: "t.eu.auth0.com",
        audience: "https://gateway.acme.com",
      },
      {
        tokenEndpoint: "https://t.eu.auth0.com/oauth/token",
        assertionAudience: "https://t.eu.auth0.com/",
        sendClientIdWithAssertion: false,
        formParams: { audience: "https://gateway.acme.com" },
      },
    ],
    [
      "cognito",
      {
        provider: "cognito",
        clientId: "c1",
        authMethod: "client_secret_basic",
        domain: "p.auth.eu-west-1.amazoncognito.com",
      },
      {
        tokenEndpoint:
          "https://p.auth.eu-west-1.amazoncognito.com/oauth2/token",
        formParams: {},
      },
    ],
    [
      "keycloak",
      {
        provider: "keycloak",
        clientId: "c1",
        authMethod: "private_key_jwt",
        baseUrl: "http://kc:8080/",
        realm: "lf",
      },
      {
        tokenEndpoint: "http://kc:8080/realms/lf/protocol/openid-connect/token",
        assertionAudience: "http://kc:8080/realms/lf",
        sendClientIdWithAssertion: false,
        formParams: {},
      },
    ],
    [
      "onelogin",
      {
        provider: "onelogin",
        clientId: "c1",
        authMethod: "client_secret_basic",
        subdomain: "acme",
        resource: "https://gateway.acme.com",
      },
      {
        tokenEndpoint: "https://acme.onelogin.com/oidc/2/token",
        formParams: { resource: "https://gateway.acme.com" },
      },
    ],
    [
      "workos",
      {
        provider: "workos",
        clientId: "c1",
        authMethod: "client_secret_post",
        domain: "auth.acme.com",
      },
      { tokenEndpoint: "https://auth.acme.com/oauth2/token" },
    ],
    [
      "authentik",
      {
        provider: "authentik",
        clientId: "c1",
        authMethod: "client_secret_post",
        baseUrl: "https://ak.acme.com",
        scope: "profile",
      },
      {
        tokenEndpoint: "https://ak.acme.com/application/o/token/",
        formParams: { scope: "profile" },
      },
    ],
    [
      "custom",
      {
        provider: "custom",
        clientId: "c1",
        authMethod: "private_key_jwt",
        tokenEndpoint: "https://idp.acme.com/as/token.oauth2",
      },
      {
        tokenEndpoint: "https://idp.acme.com/as/token.oauth2",
        assertionAudience: "https://idp.acme.com/as/token.oauth2",
        sendClientIdWithAssertion: false,
        requireX5tS256: false,
        defaultRsaAlgorithm: "RS256",
        formParams: {},
      },
    ],
  ])("%s", (_provider, config, expected) => {
    const parsed = OAuth2ConfigSchema.parse(config);
    const resolved = resolveOAuth2Profile(parsed);
    expect(resolved).toMatchObject(expected);
    expect(resolved.provider).toBe(config.provider);
    expect(resolved.clientId).toBe("c1");
    expect(resolved.authMethod).toBe(config.authMethod);
  });

  it("custom uses explicit assertion audience, client id flag, params and algorithm", () => {
    const resolved = resolveOAuth2Profile(
      OAuth2ConfigSchema.parse({
        provider: "custom",
        clientId: "c1",
        authMethod: "client_secret_jwt",
        tokenEndpoint: "https://idp.acme.com/token",
        assertionAudience: "https://idp.acme.com",
        sendClientIdWithAssertion: true,
        assertionAlgorithm: "HS512",
        scope: "a b",
        audience: "aud",
        resource: "res",
      }),
    );
    expect(resolved).toMatchObject({
      assertionAudience: "https://idp.acme.com",
      sendClientIdWithAssertion: true,
      assertionAlgorithm: "HS512",
      formParams: { scope: "a b", audience: "aud", resource: "res" },
    });
  });

  it("encodes path segments and honours a custom okta authorization server", () => {
    expect(
      resolveOAuth2Profile({
        provider: "okta",
        clientId: "c1",
        authMethod: "client_secret_basic",
        domain: "acme.okta.com",
        authorizationServerId: "aus 1/x",
        scope: "s",
      }).tokenEndpoint,
    ).toBe("https://acme.okta.com/oauth2/aus%201%2Fx/v1/token");
  });
});

describe("OAuth2ConfigSchema", () => {
  it.each([
    [
      "cognito with private_key_jwt",
      {
        provider: "cognito",
        clientId: "c1",
        authMethod: "private_key_jwt",
        domain: "p.auth.eu-west-1.amazoncognito.com",
      },
    ],
    [
      "workos with client_secret_basic",
      {
        provider: "workos",
        clientId: "c1",
        authMethod: "client_secret_basic",
        domain: "auth.acme.com",
      },
    ],
    [
      "entra with client_secret_jwt",
      { ...entraConfig, authMethod: "client_secret_jwt" },
    ],
    ["entra without scope", { ...entraConfig, scope: undefined }],
    [
      "auth0 without audience",
      {
        provider: "auth0",
        clientId: "c1",
        authMethod: "client_secret_post",
        domain: "t.eu.auth0.com",
      },
    ],
    [
      "domain with a path",
      {
        provider: "workos",
        clientId: "c1",
        authMethod: "client_secret_post",
        domain: "auth.acme.com/x",
      },
    ],
    [
      "domain with a scheme",
      {
        provider: "workos",
        clientId: "c1",
        authMethod: "client_secret_post",
        domain: "https://auth.acme.com",
      },
    ],
    [
      "assertionAlgorithm with a non-JWT method",
      { ...entraConfig, assertionAlgorithm: "RS256" },
    ],
    [
      "HS256 with private_key_jwt",
      {
        ...entraConfig,
        authMethod: "private_key_jwt",
        assertionAlgorithm: "HS256",
      },
    ],
    [
      "RS256 with client_secret_jwt",
      {
        provider: "custom",
        clientId: "c1",
        authMethod: "client_secret_jwt",
        tokenEndpoint: "https://idp.acme.com/token",
        assertionAlgorithm: "RS256",
      },
    ],
    ["unknown keys", { ...entraConfig, extra: "x" }],
    ["unknown provider", { ...entraConfig, provider: "google" }],
  ])("rejects %s", (_label, config) => {
    expect(OAuth2ConfigSchema.safeParse(config).success).toBe(false);
  });

  it("accepts an allowed assertion algorithm for private_key_jwt", () => {
    expect(
      OAuth2ConfigSchema.safeParse({
        ...entraConfig,
        authMethod: "private_key_jwt",
        assertionAlgorithm: "ES256",
      }).success,
    ).toBe(true);
  });
});

describe("OAUTH2_PROVIDER_PROFILES", () => {
  it.each(OAUTH2_PROVIDERS)(
    "%s profile matches its schema member",
    (provider) => {
      const member = OAuth2ConfigSchema.options.find(
        (option) => option.shape.provider.value === provider,
      );
      expect(member).toBeDefined();
      const shape = member!.shape as Record<
        string,
        { safeParse: (v: unknown) => { success: boolean } }
      >;
      const profile = OAUTH2_PROVIDER_PROFILES[provider];
      for (const field of profile.fields) {
        expect(shape[field.key]).toBeDefined();
        expect(shape[field.key].safeParse(undefined).success).toBe(
          !field.required,
        );
      }
      for (const method of profile.authMethods) {
        expect(shape.authMethod.safeParse(method).success).toBe(true);
      }
    },
  );
});

describe("isOAuth2Config", () => {
  it("detects a valid oauth2 block only", () => {
    expect(isOAuth2Config({ oauth2: entraConfig })).toBe(true);
    expect(isOAuth2Config({ oauth2: { provider: "entra" } })).toBe(false);
    expect(isOAuth2Config({ useResponsesApi: true })).toBe(false);
    expect(isOAuth2Config(null)).toBe(false);
  });
});

describe("connection config schemas", () => {
  it("OpenAI config accepts oauth2 next to useResponsesApi", () => {
    expect(
      OpenAIConfigSchema.parse({ useResponsesApi: true, oauth2: entraConfig }),
    ).toEqual({ useResponsesApi: true, oauth2: entraConfig });
  });

  it("Anthropic config accepts only oauth2", () => {
    expect(AnthropicConfigSchema.parse({ oauth2: entraConfig })).toEqual({
      oauth2: entraConfig,
    });
    expect(() =>
      AnthropicConfigSchema.parse({ useResponsesApi: true }),
    ).toThrow();
  });

  it("LLMConnectionConfigSchema accepts flat values and an oauth2 block", () => {
    expect(LLMConnectionConfigSchema.parse({ region: "eu" })).toEqual({
      region: "eu",
    });
    expect(LLMConnectionConfigSchema.parse({ oauth2: entraConfig })).toEqual({
      oauth2: entraConfig,
    });
    expect(() => LLMConnectionConfigSchema.parse({ foo: { a: 1 } })).toThrow();
    expect(() =>
      LLMConnectionConfigSchema.parse({ oauth2: { provider: "entra" } }),
    ).toThrow();
  });

  const apiKeyRow = {
    id: "k1",
    projectId: "p1",
    createdAt: new Date(),
    updatedAt: new Date(),
    provider: "gateway",
    displaySecretKey: "...abcd",
    secretKey: "encrypted",
    extraHeaderKeys: [],
    baseURL: "https://gateway.acme.com",
    customModels: [],
    withDefaultModels: false,
  };

  it("LLMApiKeySchema accepts an anthropic row with an oauth2 config", () => {
    const parsed = LLMApiKeySchema.parse({
      ...apiKeyRow,
      adapter: LLMAdapter.Anthropic,
      config: { oauth2: entraConfig },
    });
    expect(parsed.config).toEqual({ oauth2: entraConfig });
  });

  it("LLMApiKeySchema still parses an OpenAI useResponsesApi row as OpenAI", () => {
    const parsed = LLMApiKeySchema.parse({
      ...apiKeyRow,
      adapter: LLMAdapter.OpenAI,
      config: { useResponsesApi: true },
    });
    expect(parsed.config).toEqual({ useResponsesApi: true });
  });
});
