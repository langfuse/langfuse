import type { GatewayGuardrailAction } from "@langfuse/shared/src/db";

export const GATEWAY_GUARDRAIL_MAX_NAME_LENGTH = 200;
export const GATEWAY_GUARDRAIL_MAX_TARGETS = 100;
export const GATEWAY_GUARDRAIL_MAX_BULK_DELETE = 500;
export const GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION = 20;
export const GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE = `Organizations can have up to ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} guardrails. Reach out to support to share your use case and tell us why you need more.`;
export const GATEWAY_GUARDRAIL_FLAGGED_WINDOW_DAYS = 7;
export const GATEWAY_GUARDRAIL_TARGET_SEARCH_LIMIT = 25;

export const GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES = 20;
export const GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH = 3;
export const GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH = 32;
export const GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH = 16;

export const GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS = 500;
export const GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH = 100;

export const GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH = 500;
export const GATEWAY_GUARDRAIL_PREVIEW_TEXT_MAX_LENGTH = 4_000;

const BYTES_PER_KIB = 1024;
export const GATEWAY_GUARDRAIL_MAX_RULE_KIB = 128;
export const GATEWAY_GUARDRAIL_MAX_ORG_KIB = 512;
export const GATEWAY_GUARDRAIL_MAX_RULE_BYTES =
  GATEWAY_GUARDRAIL_MAX_RULE_KIB * BYTES_PER_KIB;
export const GATEWAY_GUARDRAIL_MAX_ORG_BYTES =
  GATEWAY_GUARDRAIL_MAX_ORG_KIB * BYTES_PER_KIB;
export const GATEWAY_GUARDRAIL_RULE_SIZE_LIMIT_ERROR_MESSAGE = `This guardrail exceeds the ${GATEWAY_GUARDRAIL_MAX_RULE_KIB} KiB compiled size limit. Simplify the pattern, use an external guardrail provider, or contact support if you need more capacity.`;
export const GATEWAY_GUARDRAIL_ORG_SIZE_LIMIT_ERROR_MESSAGE = `Your organization's guardrails exceed the ${GATEWAY_GUARDRAIL_MAX_ORG_KIB} KiB combined size limit. Simplify or remove an existing guardrail, use an external guardrail provider, or contact support if you need more capacity.`;

export const GATEWAY_GUARDRAIL_ACTION_LABELS: Record<
  GatewayGuardrailAction,
  string
> = {
  BLOCK: "Block",
  LOG: "Log",
  REDACT: "Mask",
};
