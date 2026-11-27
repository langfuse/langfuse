import type { GatewayIngestionMode } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  decryptAndParseExtraHeaders,
  instrumentAsync,
  logger,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  createEs256JwtSigner,
  type Es256JwtSigner,
} from "@/src/server/utils/jwt";

import { getEffectiveGatewayIngestionMode } from "@/src/features/ai-gateway/fns/gatewayIngestionModePolicy";
import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { resolveGatewayJwtKeys } from "@/src/features/ai-gateway/server/auth/gatewayJwtKeys";
import { GATEWAY_INGESTION_TOKEN_TTL_SECONDS } from "@/src/features/ai-gateway/server/auth/ingestionTokenVerifier";
import { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import { decodeBedrockApiKey } from "@/src/features/ai-gateway/server/provider/bedrock";
import {
  type GatewayApiFormat,
  type GatewayCachedGuardrails,
  type GatewayProviderId,
  type GatewayResolveGuardrails,
  type GatewayResolveResponse,
  getGatewayUpstream,
  getGatewayUpstreamSecret,
} from "@/src/features/ai-gateway/server/provider/registry";
import { findGatewayModelPricing } from "@/src/features/ai-gateway/server/resolve/gatewayModelPricing";

export { GatewayControlPlaneError as GatewayResolveError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";

let cachedGatewayIngestionTokenSigner:
  | {
      privateKey: string;
      keyId: string;
      issuer: string;
      audience: string;
      signer: Es256JwtSigner;
    }
  | undefined;

function getGatewayIngestionTokenSigner() {
  const { privateKey, keyId } = resolveGatewayJwtKeys({
    privateKey: env.LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY,
    publicKey: env.LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY,
    keyId: env.LANGFUSE_AI_GATEWAY_JWT_KEY_ID,
  });
  if (!privateKey || !keyId) return undefined;

  const config = {
    privateKey,
    keyId,
    issuer: env.LANGFUSE_AI_GATEWAY_JWT_ISSUER,
    audience: env.LANGFUSE_AI_GATEWAY_JWT_AUDIENCE,
  };
  if (
    !cachedGatewayIngestionTokenSigner ||
    cachedGatewayIngestionTokenSigner.privateKey !== config.privateKey ||
    cachedGatewayIngestionTokenSigner.keyId !== config.keyId ||
    cachedGatewayIngestionTokenSigner.issuer !== config.issuer ||
    cachedGatewayIngestionTokenSigner.audience !== config.audience
  ) {
    cachedGatewayIngestionTokenSigner = {
      ...config,
      signer: createEs256JwtSigner(config),
    };
  }
  return cachedGatewayIngestionTokenSigner.signer;
}

export class GatewayResolveService {
  /**
   * Starts the pricing lookup for `resolve`. It needs only the authenticated
   * context, so callers can run it while they rate-limit the request.
   */
  findPricing(
    context: GatewayApiKeyAuthContext,
  ): Promise<GatewayResolveResponse["pricing"]> {
    const { ingestionProjectId, providerModel } = context;
    // Skip requests `resolve` rejects with 403 or 404, so a client looping on
    // an unroutable model cannot turn each rejection into a pricing query.
    if (
      !getIngestionMode(context) ||
      !context.connection ||
      getEnforcedSpendLimits(context).length === 0 ||
      !ingestionProjectId ||
      !providerModel
    ) {
      return Promise.resolve(null);
    }
    const pricing = findGatewayModelPricing({
      projectId: ingestionProjectId,
      providerModel,
    });
    // A request rejected before `resolve` awaits this would otherwise leave
    // the rejection unhandled; `resolve` still rethrows it.
    pricing.catch(() => {});
    return pricing;
  }

  async resolve(params: {
    context: GatewayApiKeyAuthContext;
    apiFormat: GatewayApiFormat;
    pricing: ReturnType<GatewayResolveService["findPricing"]>;
  }): Promise<GatewayResolveResponse> {
    return instrumentAsync({ name: "gateway-resolve" }, async (span) => {
      span.setAttribute(
        "langfuse.organization.id",
        params.context.organizationId,
      );
      const { context } = params;
      const { ingestionProjectId } = context;
      const ingestionMode = getIngestionMode(context);
      // NONE mode delivers nothing to Langfuse, so it needs neither an
      // ingestion project nor ingestion signing keys.
      const deliversToLangfuse = ingestionMode !== "NONE";

      if (!ingestionMode || (deliversToLangfuse && !ingestionProjectId)) {
        throw new GatewayResolveError(
          "Gateway ingestion project is unavailable",
          403,
        );
      }
      if (!context.connection || !context.providerModel) {
        throw new GatewayResolveError(
          "No enabled gateway connection supports this API format",
          404,
        );
      }
      const decryptedCredential = decrypt(
        context.connection.encryptedCredential,
      );
      const upstream = getGatewayUpstream({
        provider: context.connection.provider,
        apiFormat: params.apiFormat,
        config: context.connection.config,
        baseURL: context.connection.baseURL,
        credential: decryptedCredential,
      });
      const spendLimits = getEnforcedSpendLimits(context);
      const pricing = await params.pricing;
      const credential = await this.getUpstreamSecret({
        connectionId: context.connection.id,
        provider: context.connection.provider,
        credential: decryptedCredential,
      });
      return {
        version: 1 as const,
        connection: {
          id: context.connection.id,
          name: context.connection.name,
          provider:
            context.connection.provider.toLowerCase() as GatewayProviderId,
          provider_model: context.providerModel,
          api_format: params.apiFormat,
          base_url: upstream.baseUrl,
          extra_headers:
            decryptAndParseExtraHeaders(context.connection.extraHeaders) ?? {},
          auth:
            upstream.authType === "bearer"
              ? ({ type: "Bearer", token: credential } as const)
              : ({
                  type: "x-api-key",
                  header: "x-api-key",
                  value: credential,
                } as const),
        },
        attribution: {
          organization_id: context.organizationId,
          project_id: ingestionProjectId,
          key_id: context.apiKeyId,
          user_id: context.userId,
          key_name: context.apiKeyName,
          user_name: context.userName,
          user_email: context.userEmail,
          key_metadata: context.keyMetadata,
          provider_connection_id: context.connection.id,
        },
        ingestion_mode:
          ingestionMode.toLowerCase() as GatewayResolveResponse["ingestion_mode"],
        ingestion:
          deliversToLangfuse && ingestionProjectId
            ? this.createIngestionResponse({
                mode: ingestionMode,
                organizationId: context.organizationId,
                projectId: ingestionProjectId,
              })
            : null,
        spend_limits: spendLimits,
        ...decryptResolvedGuardrails(
          context.guardrails,
          context.organizationId,
        ),
        pricing,
      };
    });
  }

  // Vertex AI exchanges its key for a token on every cache miss. A revoked key
  // and a Google outage both fail here, and the gateway reports either as
  // unavailable rather than blaming the caller's gateway key.
  private async getUpstreamSecret(
    params: Parameters<typeof getGatewayUpstreamSecret>[0] & {
      connectionId: string;
    },
  ) {
    try {
      return await getGatewayUpstreamSecret(params);
    } catch (error) {
      if (params.provider !== "VERTEX") throw error;
      logger.warn("Gateway connection credential exchange failed", {
        connectionId: params.connectionId,
        provider: params.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GatewayResolveError(
        "The connection's credential could not be exchanged for an access token",
        503,
      );
    }
  }

  private createIngestionResponse(params: {
    mode: GatewayIngestionMode;
    organizationId: string;
    projectId: string;
  }) {
    const signer = getGatewayIngestionTokenSigner();
    if (!signer) {
      throw new GatewayResolveError(
        "Gateway ingestion signing is not configured",
        503,
      );
    }
    return {
      access_token: signer.sign({
        expiresInSeconds: GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
        claims: {
          version: 1,
          organization_id: params.organizationId,
          project_id: params.projectId,
          ingestion_mode:
            params.mode.toLowerCase() as GatewayResolveResponse["ingestion_mode"],
          scope: "gateway-ingest",
        },
      }),
      token_type: "Bearer" as const,
      expires_at:
        Math.floor(Date.now() / 1000) + GATEWAY_INGESTION_TOKEN_TTL_SECONDS,
    };
  }
}

// Applied after the resolve cache, so an entry cached as NONE still captures
// on Cloud.
function getIngestionMode(context: GatewayApiKeyAuthContext) {
  return (
    context.ingestionMode &&
    getEffectiveGatewayIngestionMode(context.ingestionMode)
  );
}

// NONE mode records no spend, so it enforces no limits.
function getEnforcedSpendLimits(context: GatewayApiKeyAuthContext) {
  return getIngestionMode(context) === "NONE" ? [] : context.spendLimits;
}

function toInputWireScope(
  scope: GatewayCachedGuardrails[number]["scope"],
): "last_turn" | "entire_input" | null {
  switch (scope ?? "last_turn") {
    case "last_turn":
    case "last_turn_and_output":
      return "last_turn";
    case "entire_input":
    case "entire_input_and_output":
      return "entire_input";
    case "output":
      return null;
  }
}

function cachedScopeChecksOutput(
  scope: GatewayCachedGuardrails[number]["scope"],
): boolean {
  return (
    scope === "output" ||
    scope === "last_turn_and_output" ||
    scope === "entire_input_and_output"
  );
}

function decryptResolvedGuardrails(
  cached: GatewayCachedGuardrails,
  organizationId: string,
): {
  guardrails: GatewayResolveGuardrails;
  response_guardrails: GatewayResolveGuardrails;
} {
  const guardrails: GatewayResolveGuardrails = [];
  const response_guardrails: GatewayResolveGuardrails = [];
  for (const guardrail of cached) {
    const resolved = decryptResolvedGuardrail(guardrail, organizationId);
    const inputScope = toInputWireScope(guardrail.scope);
    if (inputScope !== null) {
      guardrails.push({ ...resolved, scope: inputScope });
    }
    if (cachedScopeChecksOutput(guardrail.scope)) {
      response_guardrails.push(resolved);
    }
  }
  return { guardrails, response_guardrails };
}

function decryptResolvedGuardrail(
  guardrail: GatewayCachedGuardrails[number],
  organizationId: string,
): GatewayResolveGuardrails[number] {
  if (guardrail.type === "regex") {
    const { scope: _, ...wire } = guardrail;
    return wire;
  }
  if (guardrail.type === "fail_closed") {
    const { scope: _, ...wire } = guardrail;
    return wire;
  }
  try {
    if (guardrail.type === "openai_moderation") {
      return {
        id: guardrail.id,
        name: guardrail.name,
        type: "openai_moderation" as const,
        action: guardrail.action,
        patterns: [] as [],
        region: guardrail.region,
        api_key: decrypt(guardrail.encrypted_credential),
      };
    }
    const apiKey = decodeBedrockApiKey(decrypt(guardrail.encrypted_credential));
    return {
      id: guardrail.id,
      name: guardrail.name,
      type: "bedrock" as const,
      action: guardrail.action,
      patterns: [] as [],
      guardrail_id: guardrail.guardrail_id,
      guardrail_version: guardrail.guardrail_version,
      region: guardrail.region,
      api_key: apiKey,
    };
  } catch (error) {
    logger.error(
      "External guardrail credential could not be decrypted; failing closed",
      {
        guardrailId: guardrail.id,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return {
      id: guardrail.id,
      name: guardrail.name,
      type: "fail_closed" as const,
      action: guardrail.action,
      patterns: [] as [],
    };
  }
}
