import { z } from "zod/v4";

import {
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS,
  GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
  GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";

export type GatewayGuardrailPresetGroup = "pii" | "secrets";

/**
 * Built-in rules a regex guardrail can use. Resolve sends the patterns, so the
 * gateway holds no preset logic and a pattern change ships with the control
 * plane. The gateway compiles them in ASCII mode without Unicode, so classes
 * are spelled out (no `(?i)`), and must not use lookaround or backreferences.
 */
export const GATEWAY_GUARDRAIL_PRESETS = {
  email: {
    group: "pii",
    patterns: [
      String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b`,
    ],
  },
  us_ssn: {
    group: "pii",
    patterns: [
      String.raw`\b(?:00[1-9]|0[1-9]\d|[1-578]\d\d|6[0-57-9]\d|66[0-57-9])-(?:0[1-9]|[1-9]\d)-(?:000[1-9]|00[1-9]\d|0[1-9]\d\d|[1-9]\d{3})\b`,
    ],
  },
  credit_card: {
    group: "pii",
    patterns: [
      // Visa, Mastercard and Discover (16 digits), then American Express (15).
      String.raw`\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){3}\b`,
      String.raw`\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b`,
    ],
  },
  iban: {
    group: "pii",
    patterns: [
      String.raw`\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b`,
    ],
  },
  ip_address: {
    group: "pii",
    patterns: [
      // IPv4
      String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
      // IPv6 (full 8-group)
      String.raw`\b(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}\b`,
      // IPv6 (compressed `::` form; capture group 1 holds the IP without surrounding boundary chars)
      String.raw`(?:^|[^0-9A-Za-z_:])((?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})(?:$|[^0-9A-Za-z_:])`,
    ],
  },
  aws_access_key_id: {
    group: "secrets",
    patterns: [String.raw`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`],
  },
  langfuse_api_key: {
    group: "secrets",
    patterns: [String.raw`\b(?:sk|pk)-lf-[A-Za-z0-9_-]{16,}\b`],
  },
  openai_api_key: {
    group: "secrets",
    patterns: [
      String.raw`\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b`,
      String.raw`\bsk-[A-Za-z0-9]{32,}\b`,
    ],
  },
  anthropic_api_key: {
    group: "secrets",
    patterns: [String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}\b`],
  },
  github_token: {
    group: "secrets",
    patterns: [
      String.raw`\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b`,
    ],
  },
  stripe_api_key: {
    group: "secrets",
    patterns: [String.raw`\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b`],
  },
  slack_token: {
    group: "secrets",
    patterns: [String.raw`\bxox[bpoas]-[A-Za-z0-9-]{10,}\b`],
  },
  google_api_key: {
    group: "secrets",
    patterns: [String.raw`\bAIza[0-9A-Za-z_-]{35}\b`],
  },
  private_key: {
    group: "secrets",
    patterns: [String.raw`-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----`],
  },
  jwt: {
    group: "secrets",
    patterns: [
      String.raw`\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b`,
    ],
  },
} as const satisfies Record<
  string,
  { group: GatewayGuardrailPresetGroup; patterns: readonly string[] }
>;

export type GatewayGuardrailPreset = keyof typeof GATEWAY_GUARDRAIL_PRESETS;

export const GATEWAY_GUARDRAIL_PRESET_KEYS = Object.keys(
  GATEWAY_GUARDRAIL_PRESETS,
) as [GatewayGuardrailPreset, ...GatewayGuardrailPreset[]];

export const GATEWAY_GUARDRAIL_PRESETS_BY_GROUP: Record<
  GatewayGuardrailPresetGroup,
  readonly GatewayGuardrailPreset[]
> = {
  pii: GATEWAY_GUARDRAIL_PRESET_KEYS.filter(
    (key) => GATEWAY_GUARDRAIL_PRESETS[key].group === "pii",
  ),
  secrets: GATEWAY_GUARDRAIL_PRESET_KEYS.filter(
    (key) => GATEWAY_GUARDRAIL_PRESETS[key].group === "secrets",
  ),
};

export const GatewayGuardrailPresetSchema = z.enum(
  GATEWAY_GUARDRAIL_PRESET_KEYS,
);

/** Printable ASCII without whitespace (0x21-0x7E). */
export const PRINTABLE_ASCII_NO_WHITESPACE_REGEX = /^[\x21-\x7E]+$/;

/** Printable ASCII including spaces (0x20-0x7E). */
export const PRINTABLE_ASCII_TEXT_REGEX = /^[\x20-\x7E]+$/;

const GatewayGuardrailSecretPrefixSchema = z
  .string()
  .min(
    GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH,
    `Secret prefixes must be ${GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH}-${GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH} characters`,
  )
  .max(
    GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH,
    `Secret prefixes must be ${GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH}-${GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH} characters`,
  )
  .refine(
    (value) => PRINTABLE_ASCII_NO_WHITESPACE_REGEX.test(value),
    "Secret prefixes must be printable ASCII with no whitespace",
  );

export const GatewayGuardrailSecretPrefixesSchema = z
  .array(GatewayGuardrailSecretPrefixSchema)
  .max(
    GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
    `At most ${GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES} custom secret prefixes are allowed`,
  );

const GatewayGuardrailContainsWordSchema = z
  .string()
  .trim()
  .min(1, "Word entries cannot be empty")
  .max(
    GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH,
    `Each entry must be at most ${GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH} characters`,
  )
  .refine(
    (value) => PRINTABLE_ASCII_TEXT_REGEX.test(value),
    "Only ASCII characters are supported in word lists",
  );

export const GatewayGuardrailContainsListSchema = z
  .array(GatewayGuardrailContainsWordSchema)
  .max(
    GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS,
    `At most ${GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS} entries are allowed`,
  );

/** Actions the gateway enforces and the management UI offers. */
export const GATEWAY_GUARDRAIL_UI_ACTIONS = ["BLOCK", "LOG"] as const;

export const GatewayGuardrailUiActionSchema = z.enum(
  GATEWAY_GUARDRAIL_UI_ACTIONS,
);

export type GatewayGuardrailUiAction = z.infer<
  typeof GatewayGuardrailUiActionSchema
>;

const GatewayGuardrailAssignmentInputSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("ORGANIZATION") }),
  z.object({ scope: z.literal("API_KEY"), apiKeyId: z.string().min(1) }),
  z.object({ scope: z.literal("USER"), userId: z.string().min(1) }),
]);

export type GatewayGuardrailAssignmentInput = z.infer<
  typeof GatewayGuardrailAssignmentInputSchema
>;

export const GatewayGuardrailAssignmentsInputSchema = z
  .array(GatewayGuardrailAssignmentInputSchema)
  .min(1, "Select who this guardrail applies to")
  .refine(
    (assignments) =>
      assignments.length === 1 ||
      assignments.every((assignment) => assignment.scope !== "ORGANIZATION"),
    "Everyone cannot be combined with specific users or API keys",
  );

/**
 * The stored `config` of a regex guardrail. Preset ids stay strings, so an id
 * this build does not know (a typo, or one added by a newer build) drops only
 * that preset, not the guardrail.
 */
export const GatewayRegexGuardrailConfigSchema = z.object({
  presets: z.array(z.string()).default([]),
  secretPrefixes: z.array(z.string()).default([]),
  containsWords: z.array(z.string()).default([]),
});

function presetPatterns(preset: string): readonly string[] {
  return Object.hasOwn(GATEWAY_GUARDRAIL_PRESETS, preset)
    ? GATEWAY_GUARDRAIL_PRESETS[preset as GatewayGuardrailPreset].patterns
    : [];
}

export function isKnownGuardrailPreset(
  preset: string,
): preset is GatewayGuardrailPreset {
  return Object.hasOwn(GATEWAY_GUARDRAIL_PRESETS, preset);
}

const REGEX_META_CHARS = /[.*+?^${}()|[\]\\]/g;

function escapeRegexLiteral(literal: string) {
  return literal.replace(REGEX_META_CHARS, "\\$&");
}

function escapeAsciiCaseInsensitive(literal: string) {
  let out = "";
  for (const char of literal) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += `[${char}${char.toLowerCase()}]`;
    } else if (code >= 97 && code <= 122) {
      out += `[${char.toUpperCase()}${char}]`;
    } else {
      out += escapeRegexLiteral(char);
    }
  }
  return out;
}

/**
 * Compiles one custom secret prefix into an ASCII-mode regex matching the
 * escaped prefix + >=16 token chars, bounded by explicit non-token characters.
 */
function compileSecretPrefixPattern(prefix: string): string {
  const escaped = escapeRegexLiteral(prefix);
  return `(?:^|[^A-Za-z0-9_-])(${escaped}[A-Za-z0-9_-]{${GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH},})(?:$|[^A-Za-z0-9_-])`;
}

/**
 * Compiles a "contains" word list into one escaped, ASCII case-insensitive,
 * whole-word alternation bounded by explicit non-word characters.
 */
function compileContainsPattern(words: readonly string[]): string | null {
  const deduped = deduplicateContainsWords(words);
  if (deduped.length === 0) return null;
  // Longest first so phrases win over shorter prefixes in leftmost-first engines.
  const sorted = [...deduped].sort((a, b) => b.length - a.length);
  const alternatives = sorted.map(escapeAsciiCaseInsensitive);
  return `(?:^|[^A-Za-z0-9_])((?:${alternatives.join("|")}))(?:$|[^A-Za-z0-9_])`;
}

/** Parses newline-separated words/phrases and deduplicates case-insensitively. */
export function parseContainsWordsText(text: string): string[] {
  return deduplicateContainsWords(text.split(/\r?\n/));
}

export function validateSecretPrefix(prefix: string): string | null {
  if (
    prefix.length < GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH ||
    prefix.length > GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH
  ) {
    return `Prefixes must be ${GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH}-${GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH} characters`;
  }
  if (!PRINTABLE_ASCII_NO_WHITESPACE_REGEX.test(prefix)) {
    return "Prefixes must be printable ASCII with no whitespace";
  }
  return null;
}

export function validateContainsWordsText(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "Enter at least one word or phrase to match";
  const deduped = deduplicateContainsWords(lines);
  if (deduped.length > GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS) {
    return `At most ${GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS} entries are allowed`;
  }
  for (const word of deduped) {
    if (word.length > GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH) {
      return `Each entry must be at most ${GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH} characters`;
    }
    if (!PRINTABLE_ASCII_TEXT_REGEX.test(word)) {
      return "Only ASCII characters are supported in word lists";
    }
  }
  return null;
}

export function deduplicateContainsWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Expands a stored guardrail config into the ASCII regex patterns sent to `ai-gateway`. */
export function compileGuardrailConfigPatterns(config: {
  presets?: readonly string[];
  secretPrefixes?: readonly string[];
  containsWords?: readonly string[];
}): string[] {
  const patterns: string[] = [];
  for (const preset of config.presets ?? []) {
    patterns.push(...presetPatterns(preset));
  }
  for (const prefix of config.secretPrefixes ?? []) {
    if (
      prefix.length >= GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH &&
      prefix.length <= GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH &&
      PRINTABLE_ASCII_NO_WHITESPACE_REGEX.test(prefix)
    ) {
      patterns.push(compileSecretPrefixPattern(prefix));
    }
  }
  const validContains = (config.containsWords ?? []).filter((word) =>
    PRINTABLE_ASCII_TEXT_REGEX.test(word.trim()),
  );
  const containsPattern = compileContainsPattern(validContains);
  if (containsPattern) patterns.push(containsPattern);
  return patterns;
}

/**
 * Estimates compiled Thompson NFA bytes for a set of ASCII regex patterns
 * using an 8-byte state + 8-byte transition model.
 */
export function estimateCompiledPatternsBytes(
  patterns: readonly string[],
): number {
  const STATE_BYTES = 8;
  const TRANSITION_BYTES = 8;
  let bytes = 0;
  for (const pattern of patterns) {
    // Each character class `[Aa]` compiles to one state (~24 B); simple literals to one state (~16 B).
    let index = 0;
    while (index < pattern.length) {
      const char = pattern[index];
      if (char === "\\") {
        bytes += STATE_BYTES + TRANSITION_BYTES;
        index += 2;
        continue;
      }
      if (char === "[") {
        const end = pattern.indexOf("]", index + 1);
        const span = end === -1 ? pattern.length - index : end - index;
        bytes += STATE_BYTES + Math.min(span, 8) * TRANSITION_BYTES;
        index = end === -1 ? pattern.length : end + 1;
        continue;
      }
      if (char === "{") {
        const end = pattern.indexOf("}", index + 1);
        const body = end === -1 ? "" : pattern.slice(index + 1, end);
        const repeat = Number.parseInt(body.split(",")[0] ?? "1", 10);
        if (Number.isFinite(repeat) && repeat > 1) {
          bytes += (repeat - 1) * (STATE_BYTES + TRANSITION_BYTES);
        }
        index = end === -1 ? pattern.length : end + 1;
        continue;
      }
      bytes += STATE_BYTES + TRANSITION_BYTES;
      index += 1;
    }
  }
  return bytes;
}
