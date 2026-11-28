import type { z } from "zod/v4";

import { validateBedrockGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateBedrockGuardrail";
import { validateLakeraGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateLakeraGuardrail";
import { validateOpenAiModerationGuardrail } from "@/src/features/ai-gateway/server/guardrails/validateOpenAiModerationGuardrail";
import {
  decodeBedrockApiKey,
  encodeBedrockCredential,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import type { GatewayCachedGuardrails } from "@/src/features/ai-gateway/server/provider/registry";
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
 * Wraps one provider's typed operations behind signatures that take stored or
 * validated input as `unknown`, so callers can use any provider through the
 * same calls.
 */
function externalGuardrailProvider<
  Type extends GatewayExternalType,
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
    parseConfig,
    /** Parses router-validated input into the config to store. */
    requireConfig: (config: unknown): z.output<Schema> =>
      definition.configSchema.parse(config),
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

function identity(value: string) {
  return value;
}
