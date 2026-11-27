import { decrypt } from "@langfuse/shared/encryption";
import { decryptAndParseExtraHeaders } from "@langfuse/shared/src/server";
import type { z } from "zod/v4";

import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { formatDecisionModelPredicateInstructions } from "@/src/fns/formatDecisionModelPredicateInstructions";
import { validateBedrockGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateBedrockGuardrail";
import { validateDecisionModelGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateDecisionModelGuardrail";
import { validateLakeraGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateLakeraGuardrail";
import { validateOpenAiModerationGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateOpenAiModerationGuardrail";
import {
  decodeBedrockApiKey,
  encodeBedrockCredential,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import {
  getGatewayUpstream,
  providerSupportsApiFormat,
  type GatewayCachedGuardrails,
  type GatewayProviderId,
  type GatewayProviderName,
} from "@/src/features/ai-gateway/server/provider/registry";
import {
  GATEWAY_EXTERNAL_GUARDRAIL_CONFIG_SCHEMAS,
  type GatewayExternalGuardrailType,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

type CachedExternalGuardrail = Exclude<
  GatewayCachedGuardrails[number],
  { type: "regex" | "fail_closed" }
>;

type GatewayExternalType = CachedExternalGuardrail["type"];

/** The provider fields a cached guardrail carries besides the common ones. */
type CachedExternalFields<T extends GatewayExternalType> = Omit<
  Extract<CachedExternalGuardrail, { type: T }>,
  "id" | "name" | "type" | "action" | "scope" | "encrypted_credential"
>;

export type ResolvedGuardrailConnection = {
  id: string;
  provider: GatewayProviderName;
  baseURL: string | null;
  config: unknown;
  allowedModels: string[] | null;
  encryptedCredential: string;
  extraHeaders: string | null;
};

/**
 * Everything the control plane does per external guardrail provider. Adding a
 * provider means adding a config schema, a gateway type, and an entry here.
 */
export const EXTERNAL_GUARDRAIL_PROVIDERS = {
  BEDROCK: externalGuardrailProvider({
    gatewayType: "bedrock",
    configSchema: GATEWAY_EXTERNAL_GUARDRAIL_CONFIG_SCHEMAS.BEDROCK,
    toCachedFields: (config) => ({
      guardrail_id: config.guardrailId,
      guardrail_version: config.guardrailVersion,
      region: config.region,
    }),
    validate: validateBedrockGuardrail,
    // Same shape as LLM connections so SigV4 access keys can share the column later.
    encodeCredential: encodeBedrockCredential,
    decodeCredential: decodeBedrockApiKey,
  }),
  OPENAI_MODERATION: externalGuardrailProvider({
    gatewayType: "openai_moderation",
    configSchema: GATEWAY_EXTERNAL_GUARDRAIL_CONFIG_SCHEMAS.OPENAI_MODERATION,
    toCachedFields: (config) => ({
      region: config.region,
    }),
    validate: validateOpenAiModerationGuardrail,
  }),
  LAKERA: externalGuardrailProvider({
    gatewayType: "lakera",
    configSchema: GATEWAY_EXTERNAL_GUARDRAIL_CONFIG_SCHEMAS.LAKERA,
    toCachedFields: (config) => ({
      region: config.region,
      ...(config.projectId ? { project_id: config.projectId } : {}),
    }),
    validate: validateLakeraGuardrail,
  }),
  DECISION_MODEL: connectionExternalGuardrailProvider({
    gatewayType: "decision_model",
    configSchema: GATEWAY_EXTERNAL_GUARDRAIL_CONFIG_SCHEMAS.DECISION_MODEL,
    getConnectionId: (config) => config.connectionId,
    toCachedFields: (config, connection) => {
      if (!providerSupportsApiFormat(connection.provider, "openai.decisions")) {
        return null;
      }
      if (
        !isGatewayModelAllowed(
          toGatewayAllowedModelsSet(connection.allowedModels),
          config.model,
        )
      ) {
        return null;
      }
      const upstream = getGatewayUpstream({
        provider: connection.provider,
        apiFormat: "openai.decisions",
        config: connection.config,
        baseURL: connection.baseURL,
        credential: "",
      });
      return {
        provider: connection.provider.toLowerCase() as GatewayProviderId,
        base_url: upstream.baseUrl,
        model: config.model,
        instructions: formatDecisionModelPredicateInstructions(
          config.question,
          config.criteria,
        ),
        threshold: config.threshold,
        ...(connection.extraHeaders
          ? { encrypted_extra_headers: connection.extraHeaders }
          : {}),
      };
    },
    validate: async (config, connection) => {
      const apiKey = decrypt(connection.encryptedCredential);
      const extraHeaders =
        decryptAndParseExtraHeaders(connection.extraHeaders) ?? {};
      const upstream = getGatewayUpstream({
        provider: connection.provider,
        apiFormat: "openai.decisions",
        config: connection.config,
        baseURL: connection.baseURL,
        credential: apiKey,
      });
      await validateDecisionModelGuardrail({
        ...config,
        baseUrl: upstream.baseUrl,
        baseURL: connection.baseURL,
        apiKey,
        extraHeaders,
      });
    },
  }),
} satisfies Record<GatewayExternalGuardrailType, unknown>;

/** Decodes the stored credential of a cached guardrail of gateway `type`. */
export function decodeCachedExternalCredential(
  type: GatewayExternalType,
  credential: string,
) {
  const provider = Object.values(EXTERNAL_GUARDRAIL_PROVIDERS).find(
    (candidate) => candidate.gatewayType === type,
  );
  return provider ? provider.decodeCredential(credential) : credential;
}

/**
 * Wraps one API-key-backed provider's typed operations behind signatures that
 * take stored or validated input as `unknown`, so callers can use any provider
 * through the same calls.
 */
function externalGuardrailProvider<
  Type extends Exclude<GatewayExternalType, "decision_model">,
  Schema extends z.ZodType<object>,
>(definition: {
  /** The guardrail `type` the gateway reads from `/resolve`. */
  gatewayType: Type;
  configSchema: Schema;
  toCachedFields: (config: z.output<Schema>) => CachedExternalFields<Type>;
  validate: (params: z.output<Schema> & { apiKey: string }) => Promise<void>;
  encodeCredential?: (apiKey: string) => string;
  decodeCredential?: (credential: string) => string;
}) {
  const parseConfig = (config: unknown): z.output<Schema> | null => {
    const parsed = definition.configSchema.safeParse(config);
    return parsed.success ? parsed.data : null;
  };
  return {
    gatewayType: definition.gatewayType,
    usesGatewayConnection: false as const,
    parseConfig,
    /** Parses router-validated input into the config to store. */
    requireConfig: (config: unknown): z.output<Schema> =>
      definition.configSchema.parse(config),
    getConnectionId: (_config: unknown): string | null => null,
    /** Checks `config` and `apiKey` against the provider; throws `ProviderCredentialRejectedError`. */
    validate: (config: unknown, apiKey: string) =>
      definition.validate({ ...definition.configSchema.parse(config), apiKey }),
    /** Cached `/resolve` fields of a stored config, or `null` when it no longer parses. */
    toCachedFields: (config: unknown) => {
      const parsed = parseConfig(config);
      return parsed === null
        ? null
        : {
            type: definition.gatewayType,
            ...definition.toCachedFields(parsed),
          };
    },
    isSameConfig: (stored: unknown, next: unknown) =>
      JSON.stringify(parseConfig(stored)) === JSON.stringify(parseConfig(next)),
    encodeCredential: definition.encodeCredential ?? identity,
    decodeCredential: definition.decodeCredential ?? identity,
  };
}

/**
 * Wraps one connection-backed provider's typed operations behind the same
 * uniform interface, reading credentials and endpoints from a gateway connection.
 */
function connectionExternalGuardrailProvider<
  Type extends Extract<GatewayExternalType, "decision_model">,
  Schema extends z.ZodType<object>,
>(definition: {
  gatewayType: Type;
  configSchema: Schema;
  getConnectionId: (config: z.output<Schema>) => string;
  toCachedFields: (
    config: z.output<Schema>,
    connection: ResolvedGuardrailConnection,
  ) => CachedExternalFields<Type> | null;
  validate: (
    config: z.output<Schema>,
    connection: ResolvedGuardrailConnection,
  ) => Promise<void>;
}) {
  const parseConfig = (config: unknown): z.output<Schema> | null => {
    const parsed = definition.configSchema.safeParse(config);
    return parsed.success ? parsed.data : null;
  };
  return {
    gatewayType: definition.gatewayType,
    usesGatewayConnection: true as const,
    parseConfig,
    requireConfig: (config: unknown): z.output<Schema> =>
      definition.configSchema.parse(config),
    getConnectionId: (config: unknown): string | null => {
      const parsed = parseConfig(config);
      return parsed ? definition.getConnectionId(parsed) : null;
    },
    validateWithConnection: (
      config: unknown,
      connection: ResolvedGuardrailConnection,
    ) => definition.validate(definition.configSchema.parse(config), connection),
    toCachedFieldsWithConnection: (
      config: unknown,
      connection: ResolvedGuardrailConnection | undefined,
    ) => {
      const parsed = parseConfig(config);
      if (parsed === null || !connection) return null;
      const fields = definition.toCachedFields(parsed, connection);
      return fields === null
        ? null
        : {
            type: definition.gatewayType,
            ...fields,
          };
    },
    isSameConfig: (stored: unknown, next: unknown) =>
      JSON.stringify(parseConfig(stored)) === JSON.stringify(parseConfig(next)),
    encodeCredential: identity,
    decodeCredential: identity,
  };
}

function identity(value: string) {
  return value;
}
