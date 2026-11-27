import type {
  GatewayGuardrailAction,
  GatewayGuardrailScope,
} from "@langfuse/shared/src/db";

export const GATEWAY_GUARDRAIL_MAX_NAME_LENGTH = 200;
export const GATEWAY_GUARDRAIL_MAX_TARGETS = 100;
export const GATEWAY_GUARDRAIL_MAX_BULK_DELETE = 500;
export const GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION = 20;
export const GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE = `Organizations can have up to ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} guardrails. Reach out to support to share your use case and tell us why you need more.`;
export const GATEWAY_GUARDRAIL_FLAGGED_WINDOW_DAYS = 7;
export const GATEWAY_GUARDRAIL_FLAGGED_DATE_RANGE = {
  range: "last7Days",
} as const;
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

export const GATEWAY_GUARDRAIL_UNSUPPORTED_LOOKAROUND_ERROR_MESSAGE =
  "Look-ahead and look-behind are not supported in built-in regex guardrails. Rewrite the pattern without look-around, or use an external guardrail provider.";
export const GATEWAY_GUARDRAIL_UNSUPPORTED_BACKREFERENCE_ERROR_MESSAGE =
  "Backreferences are not supported in built-in regex guardrails. Rewrite the pattern without backreferences, or use an external guardrail provider.";
export const GATEWAY_GUARDRAIL_UNICODE_NOT_ALLOWED_ERROR_MESSAGE =
  "Unicode classes (\\p{..}) and the u flag are not supported in built-in regex guardrails. Use ASCII patterns, or use an external guardrail provider.";

export const GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL = "[REDACTED]";
export const GATEWAY_GUARDRAIL_MAX_REDACTION_LABEL_LENGTH = 64;

export const GATEWAY_GUARDRAIL_ACTION_LABELS: Record<
  GatewayGuardrailAction,
  string
> = {
  BLOCK: "Block",
  LOG: "Log",
  REDACT: "Redact",
  ENFORCE: "Enforce",
};

export const GATEWAY_GUARDRAIL_ACTION_DESCRIPTIONS: Record<
  GatewayGuardrailAction,
  string
> = {
  BLOCK: "Reject the request or response when matched.",
  REDACT: "Replace matched text with the replacement label.",
  ENFORCE:
    "Follow the provider's verdict: block when it blocks, or anonymize matched text.",
  LOG: "Pass through unchanged and record the match on the generation.",
};

export const GATEWAY_GUARDRAIL_SCOPES = [
  "LAST_TURN",
  "ENTIRE_INPUT",
  "OUTPUT",
  "LAST_TURN_AND_OUTPUT",
  "ENTIRE_INPUT_AND_OUTPUT",
] as const satisfies readonly GatewayGuardrailScope[];

export const GATEWAY_GUARDRAIL_SCOPE_LABELS: Record<
  GatewayGuardrailScope,
  string
> = {
  LAST_TURN: "Last turn",
  ENTIRE_INPUT: "Entire input",
  OUTPUT: "Output",
  LAST_TURN_AND_OUTPUT: "Last turn & output",
  ENTIRE_INPUT_AND_OUTPUT: "Entire input & output",
};

export const GATEWAY_GUARDRAIL_SCOPE_DESCRIPTIONS: Record<
  GatewayGuardrailScope,
  string
> = {
  LAST_TURN:
    "Evaluate only the latest user turn and tool outputs since the last model reply.",
  ENTIRE_INPUT:
    "Evaluate all messages and system prompts in the request, including conversation history. Recommended for redaction so earlier turns aren't resent unredacted.",
  OUTPUT: "Evaluate provider responses before returning them to the client.",
  LAST_TURN_AND_OUTPUT:
    "Evaluate the latest user turn and tool outputs, plus provider responses.",
  ENTIRE_INPUT_AND_OUTPUT:
    "Evaluate all messages and system prompts in the request, plus provider responses.",
};
