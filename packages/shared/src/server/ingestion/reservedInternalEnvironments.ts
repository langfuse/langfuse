import { LangfuseInternalTraceEnvironment } from "../llm/types";
import {
  INTERNAL_INGESTION_SDK_NAMES,
  type IngestionAttribution,
} from "./ingestionAttribution";
import type { IngestionEventType } from "./types";

const LANGFUSE_ENVIRONMENT_PREFIX = /^(?:langfuse[-_]?)+/;

/** Strip reserved `langfuse-` namespace prefix from an environment value. */
export const stripLangfuseEnvironmentPrefix = (environment: string): string =>
  environment.replace(LANGFUSE_ENVIRONMENT_PREFIX, "");

const INTERNAL_ENVIRONMENT_VALUES = [
  ...Object.values(LangfuseInternalTraceEnvironment),
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

/**
 * Public-ingestion aliases (post-prefix-strip) for reserved internal environments.
 * Public ingestion lowercases and strips the `langfuse-` prefix, so provider
 * broadcast callbacks (e.g. OpenRouter) arrive as `llm-as-a-judge` instead of
 * `langfuse-llm-as-a-judge`.
 */
export const RESERVED_PUBLIC_INTERNAL_ENVIRONMENT_ALIASES: ReadonlySet<string> =
  new Set(
    INTERNAL_ENVIRONMENT_VALUES.map((environment) =>
      stripLangfuseEnvironmentPrefix(environment).toLowerCase(),
    ),
  );

/**
 * Whether an environment belongs to Langfuse's reserved internal namespace.
 * Matches full internal names (`langfuse-*`) and public-ingestion aliases
 * (`llm-as-a-judge`, `code-eval`, …) that result from prefix stripping.
 */
export const isInternalEnvironmentNamespace = (
  environment: string | null | undefined,
): boolean => {
  if (!environment) {
    return false;
  }

  const normalized = environment.toLowerCase();
  if (normalized.startsWith("langfuse")) {
    return true;
  }

  return RESERVED_PUBLIC_INTERNAL_ENVIRONMENT_ALIASES.has(normalized);
};

const isInternalIngestionSdk = (sdkName: string): boolean =>
  (INTERNAL_INGESTION_SDK_NAMES as readonly string[]).includes(sdkName);

/**
 * Drop external/public ingestion of telemetry for reserved internal environments.
 * Langfuse-internal writers use `langfuse-internal-*` SDK names and the internal
 * ingestion schema; provider broadcast callbacks reuse the project's public key
 * and must not create duplicate judge/eval traces (see #12958).
 */
export const shouldDropExternalIngestionForReservedEnvironment = (
  environment: string | null | undefined,
  attribution: IngestionAttribution,
): boolean => {
  if (!isInternalEnvironmentNamespace(environment)) {
    return false;
  }

  return !isInternalIngestionSdk(attribution.ingestionSdkName);
};

export const shouldDropPublicIngestionForEnvironment = (
  environment: string | null | undefined,
  opts: {
    isLangfuseInternal?: boolean;
    attribution: IngestionAttribution;
  },
): boolean => {
  if (opts.isLangfuseInternal) {
    return false;
  }

  return shouldDropExternalIngestionForReservedEnvironment(
    environment,
    opts.attribution,
  );
};

export const getIngestionEventEnvironment = (
  event: IngestionEventType,
): string | undefined => {
  const body = event.body as { environment?: string };
  return body.environment;
};
