import type {
  GatewayGuardrailAction,
  GatewayGuardrailScope,
  GatewayGuardrailType,
} from "@langfuse/shared/src/db";
import { z } from "zod/v4";

import {
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORD_LENGTH,
  GATEWAY_GUARDRAIL_MAX_CONTAINS_WORDS,
  GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH,
  GATEWAY_GUARDRAIL_MAX_REDACTION_LABEL_LENGTH,
  GATEWAY_GUARDRAIL_MAX_SECRET_PREFIXES,
  GATEWAY_GUARDRAIL_SCOPES,
  GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";

export type GatewayGuardrailPresetGroup =
  | "pii"
  | "secrets"
  | "prompt_injection";

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

function ciAlt(...words: string[]) {
  return `(?:${words.map(escapeAsciiCaseInsensitive).join("|")})`;
}

function ciPlural(word: string) {
  return `${escapeAsciiCaseInsensitive(word)}[Ss]?`;
}

function ciPluralAlt(...words: string[]) {
  return `(?:${words.map(ciPlural).join("|")})`;
}

// Explicit ASCII whitespace so browser `RegExp(..., "gu")` matches the Rust ASCII engine.
const ASCII_WS = String.raw`[ \t\r\n]+`;

export type GatewayGuardrailTemplateKind =
  | "pii"
  | "secrets"
  | "prompt_injection"
  | "contains"
  | "custom_regex"
  | "bedrock"
  | "openai_moderation";

/**
 * Built-in rules a regex guardrail can use. Resolve sends the patterns, so the
 * gateway holds no preset logic and a pattern change ships with the control
 * plane. The engine enforces ASCII semantics for `\w`, `\d`, `\s`, and `\b`
 * and rejects `\p{..}`, `(?u)`, lookaround, and backreferences; explicit
 * `\u{...}` code-point escapes are supported in both Rust and JS `u` mode.
 * Case-insensitive character classes are spelled out (no `(?i)`) so client
 * preview regexes stay compatible with JavaScript `RegExp`.
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
  us_itin: {
    group: "pii",
    patterns: [
      // IRS ITIN: 9XX-(50-65 | 70-88 | 90-92 | 94-99)-XXXX.
      String.raw`\b9\d{2}-(?:5\d|6[0-5]|7\d|8[0-8]|9[0-24-9])-\d{4}\b`,
    ],
  },
  uk_nino: {
    group: "pii",
    patterns: [
      // HMRC NINO: excludes D,F,I,Q,U,V (1st), D,F,I,O,Q,U,V (2nd), and forbidden pairs BG,GB,KN,NK,NT,TN,ZZ.
      String.raw`\b(?:[ACEHJLMOPRSW-Y][A-CEGHJ-NPR-TW-Z]|B[A-CEHJ-NPR-TW-Z]|G[ACEGHJ-NPR-TW-Z]|[KT][A-CEGHJ-MPR-TW-Z]|N[A-CEGHJL-NPRSW-Z]|Z[A-CEGHJ-NPR-TW-Y])(?: ?\d{2} ?\d{2} ?\d{2} ?|-\d{2}-\d{2}-\d{2}-)[A-D]\b`,
    ],
  },
  eu_vat_id: {
    group: "pii",
    patterns: [
      String.raw`\b(?:ATU\d{8}|BE[01]\d{9}|BG\d{9,10}|CY\d{8}[A-Z]|CZ\d{8,10}|(?:DK|FI|HU|LU|MT|SI)\d{8}|(?:DE|EE|EL|PT)\d{9}|ES(?:[A-Z]\d{7}[A-Z0-9]|\d{8}[A-Z])|FR[A-HJ-NP-Z0-9]{2}\d{9}|(?:HR|IT|LV)\d{11}|IE(?:\d[A-Z0-9+*]\d{5}[A-Z]|\d{7}[A-Z]{1,2})|LT(?:\d{9}|\d{12})|NL\d{9}B\d{2}|(?:PL|SK)\d{10}|RO\d{6,10}|SE\d{10}01)\b`,
    ],
  },
  german_steuer_id: {
    group: "pii",
    patterns: [
      // Anchored to a German tax-ID keyword so bare 11-digit numbers never match;
      // named capture group `__lf_match` isolates the 11-digit ID for redaction.
      String.raw`\b(?:${escapeAsciiCaseInsensitive("steuer")}(?:[ -]?${escapeAsciiCaseInsensitive("id")}(?:${escapeAsciiCaseInsensitive("nr")}\.?)?|[ -]?${escapeAsciiCaseInsensitive("identifikationsnummer")})|${escapeAsciiCaseInsensitive("id")}[ ._-]?${escapeAsciiCaseInsensitive("nr")}\.?)(?:[ \t]*[:=#-][ \t]*|[ \t]+(?:${escapeAsciiCaseInsensitive("is")}[Tt]?[ \t]+)?)(?<__lf_match>[1-9]\d{10}|[1-9]\d \d{3} \d{3} \d{3}|[1-9]\d-\d{3}-\d{3}-\d{3})\b`,
    ],
  },
  phone_number: {
    group: "pii",
    patterns: [
      // International E.164 or formatted number with leading `+` country code (8-15 digits).
      String.raw`(?:^|[^A-Za-z0-9_+.-])(?<__lf_match>\+[1-9](?:\d{7,14}|\d{0,2}(?:(?:[ .-]\(0\))?[ .-](?:\(\d{1,4}\)[ .-]?|\d{1,4}[ .-])\d{3,4}[ .-]\d{4}|(?:[ .-]\(0\))?[ .-](?:\(\d{2,5}\)[ .-]?|\d{2,5}[ .-])\d{5,10}|[ .-]\d{1,3}(?:[ .-]\d{2}){4}|[ .-]\d{2}[ .-]\d{3}(?:[ .-]\d{2}){2}|[ -]\d{7,12})))(?:$|\.(?:$|[^A-Za-z0-9_])|[^A-Za-z0-9_.-])`,
      // Formatted North American (NANP) number with explicit separators; never bare digit runs.
      String.raw`(?:^|[^A-Za-z0-9_+.-])(?<__lf_match>(?:1[ .-])?(?:\([2-9]\d{2}\)[ .-]?[2-9]\d{2}[ .-]\d{4}|[2-9]\d{2}-[2-9]\d{2}-\d{4}|[2-9]\d{2}\.[2-9]\d{2}\.\d{4}|[2-9]\d{2} [2-9]\d{2} \d{4}))(?:$|\.(?:$|[^A-Za-z0-9_])|[^A-Za-z0-9_.-])`,
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
      // IPv6 (compressed `::` form; named capture group `__lf_match` holds the IP without surrounding boundary chars)
      String.raw`(?:^|[^0-9A-Za-z_:])(?<__lf_match>(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})(?:$|[^0-9A-Za-z_:])`,
    ],
  },
  aws_access_key_id: {
    group: "secrets",
    patterns: [String.raw`\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b`],
  },
  langfuse_api_key: {
    group: "secrets",
    patterns: [String.raw`\b(?:sk|pk)-lf-[A-Za-z0-9_-]{16,}\b`],
  },
  openai_api_key: {
    group: "secrets",
    patterns: [
      String.raw`\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}\b`,
      String.raw`\bsk-[A-Za-z0-9]{32,}\b`,
    ],
  },
  anthropic_api_key: {
    group: "secrets",
    patterns: [String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}\b`],
  },
  openrouter_api_key: {
    group: "secrets",
    patterns: [String.raw`\bsk-or-v1-[0-9a-f]{64}\b`],
  },
  huggingface_token: {
    group: "secrets",
    patterns: [String.raw`\bhf_[A-Za-z0-9]{30,}\b`],
  },
  github_token: {
    group: "secrets",
    patterns: [
      String.raw`\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b`,
    ],
  },
  gitlab_token: {
    group: "secrets",
    patterns: [
      String.raw`(?:^|[^A-Za-z0-9_-])(?<__lf_match>glpat-[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+)*)(?:$|[^A-Za-z0-9_-])`,
    ],
  },
  npm_token: {
    group: "secrets",
    patterns: [String.raw`\bnpm_[A-Za-z0-9]{36}\b`],
  },
  pypi_token: {
    group: "secrets",
    patterns: [
      String.raw`(?:^|[^A-Za-z0-9_-])(?<__lf_match>pypi-AgE(?:IcHlwaS5vcmc|NdGVzdC5weXBpLm9yZw)[A-Za-z0-9_-]{40,})(?:$|[^A-Za-z0-9_-])`,
    ],
  },
  stripe_api_key: {
    group: "secrets",
    patterns: [String.raw`\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b`],
  },
  stripe_test_key: {
    group: "secrets",
    patterns: [String.raw`\b(?:sk|rk)_test_[A-Za-z0-9]{16,}\b`],
  },
  slack_token: {
    group: "secrets",
    patterns: [String.raw`\bxox[bpoas]-[A-Za-z0-9-]{10,}\b`],
  },
  slack_app_token: {
    group: "secrets",
    patterns: [String.raw`\bxapp-\d-[A-Za-z0-9]+-\d+-[A-Za-z0-9]{16,}\b`],
  },
  slack_webhook_url: {
    group: "secrets",
    patterns: [
      String.raw`\bhttps://hooks\.slack(?:-gov)?\.com/(?:services|workflows|triggers)/[A-Za-z0-9_-]{6,}(?:/[A-Za-z0-9_-]{6,}){2,}\b`,
    ],
  },
  sendgrid_api_key: {
    group: "secrets",
    patterns: [
      String.raw`(?:^|[^A-Za-z0-9_-])(?<__lf_match>SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{32,})(?:$|[^A-Za-z0-9_-])`,
    ],
  },
  google_api_key: {
    group: "secrets",
    patterns: [String.raw`\bAIza[0-9A-Za-z_-]{35}\b`],
  },
  google_oauth_client_secret: {
    group: "secrets",
    patterns: [
      String.raw`(?:^|[^A-Za-z0-9_-])(?<__lf_match>GOCSPX-[A-Za-z0-9_-]{20,})(?:$|[^A-Za-z0-9_-])`,
    ],
  },
  databricks_token: {
    group: "secrets",
    patterns: [String.raw`\bdapi[0-9a-f]{32}(?:-\d)?\b`],
  },
  atlassian_api_token: {
    group: "secrets",
    patterns: [
      String.raw`(?:^|[^A-Za-z0-9_-])(?<__lf_match>ATATT3[A-Za-z0-9_=-]{20,})(?:$|[^A-Za-z0-9_-])`,
    ],
  },
  linear_api_key: {
    group: "secrets",
    patterns: [String.raw`\blin_api_[A-Za-z0-9]{32,}\b`],
  },
  shopify_token: {
    group: "secrets",
    patterns: [String.raw`\bshp(?:at|ca|pa|ss)_[0-9a-fA-F]{32}\b`],
  },
  digitalocean_token: {
    group: "secrets",
    patterns: [String.raw`\bdo[pors]_v1_[0-9a-f]{64}\b`],
  },
  database_connection_string: {
    group: "secrets",
    patterns: [
      String.raw`\b(?:postgres(?:ql)?|mysql|mongodb|rediss?|amqps?)(?:\+[A-Za-z0-9_]+)?://[^\s/:@"'<>]*:[^\s/@"'<>]+@(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:]+\])(?::\d{1,5})?(?:/(?:[A-Za-z0-9._~/%?&+=:@-]*[A-Za-z0-9_~/%?&+=:@-])?)?`,
    ],
  },
  private_key: {
    group: "secrets",
    patterns: [
      // Matches a full PEM block (real or JSON-escaped `\n`/`\r\n`) when an END
      // marker follows, or the opening BEGIN header alone if truncated. Disallowing
      // `--` inside the body keeps repeated BEGIN headers strictly linear time.
      String.raw`-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:(?:\s|\\[nr])+(?:[A-Za-z0-9+/=:, \t\r\n\\]|-[A-Za-z0-9])*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)?`,
    ],
  },
  jwt: {
    group: "secrets",
    patterns: [
      String.raw`\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b`,
    ],
  },
  prompt_injection_instruction_override: {
    group: "prompt_injection",
    patterns: [
      String.raw`\b${ciAlt("ignore", "disregard", "forget")}${ASCII_WS}(?:(?:${ciAlt("all", "any", "the", "your")}${ASCII_WS})?${ciAlt("previous", "prior", "above", "earlier")}|${escapeAsciiCaseInsensitive("all")})${ASCII_WS}(?:${ciAlt("safety", "security", "system", "original", "initial")}${ASCII_WS})?${ciPluralAlt("instruction", "rule", "guideline", "directive", "constraint")}\b`,
      String.raw`\b${escapeAsciiCaseInsensitive("override")}${ASCII_WS}(?:(?:${ciAlt("all", "any", "the", "your")}${ASCII_WS})?${ciAlt("previous", "prior", "system", "original", "safety", "security")}|${escapeAsciiCaseInsensitive("your")})${ASCII_WS}${ciPluralAlt("instruction", "rule", "guideline", "directive", "constraint")}\b`,
      String.raw`\b${escapeAsciiCaseInsensitive("do")}${ASCII_WS}${escapeAsciiCaseInsensitive("not")}${ASCII_WS}${escapeAsciiCaseInsensitive("follow")}${ASCII_WS}(?:${ciAlt("the", "your")}${ASCII_WS})?${ciAlt("system", "developer", "previous", "prior", "original")}${ASCII_WS}${ciPluralAlt("prompt", "instruction", "rule", "guideline")}\b`,
      String.raw`\b(?:${escapeAsciiCaseInsensitive("all")}${ASCII_WS})?${ciAlt("previous", "prior")}${ASCII_WS}${ciPlural("instruction")}${ASCII_WS}${ciAlt("are", "is")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("now")}${ASCII_WS})?${ciAlt("void", "invalid", "null", "obsolete", "cancelled", "canceled", "revoked")}\b`,
    ],
  },
  prompt_injection_prompt_extraction: {
    group: "prompt_injection",
    patterns: [
      String.raw`\b${ciAlt("reveal", "print", "show", "output", "display", "leak", "dump", "expose")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("me")}${ASCII_WS})?${ciAlt("your", "the")}${ASCII_WS}(?:${ciAlt("full", "hidden", "complete", "internal", "secret", "original", "initial", "exact")}${ASCII_WS})?${escapeAsciiCaseInsensitive("system")}${ASCII_WS}${ciPluralAlt("prompt", "instruction")}\b`,
      String.raw`\b${ciAlt("reveal", "print", "output", "leak", "dump", "expose")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("me")}${ASCII_WS})?${ciAlt("your", "the")}${ASCII_WS}${ciAlt("hidden", "secret", "initial", "original", "internal")}${ASCII_WS}${ciPluralAlt("prompt", "instruction")}\b`,
      String.raw`\b${escapeAsciiCaseInsensitive("repeat")}${ASCII_WS}(?:${ciAlt("the", "all")}${ASCII_WS})?(?:${ciAlt("text", "words")}|${ciPluralAlt("prompt", "instruction")})${ASCII_WS}(?:${escapeAsciiCaseInsensitive("above")}|${escapeAsciiCaseInsensitive("before")}${ASCII_WS}${escapeAsciiCaseInsensitive("this")})\b`,
    ],
  },
  prompt_injection_jailbreak: {
    group: "prompt_injection",
    patterns: [
      String.raw`\b${escapeAsciiCaseInsensitive("you")}${ASCII_WS}${escapeAsciiCaseInsensitive("are")}${ASCII_WS}${escapeAsciiCaseInsensitive("now")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("in")}${ASCII_WS})?(?:DAN|${ciAlt("developer", "jailbreak", "jailbroken", "unrestricted", "god")}${ASCII_WS}${escapeAsciiCaseInsensitive("mode")})\b`,
      String.raw`\bDAN\b[\x20-\x7E]{0,40}\b${escapeAsciiCaseInsensitive("do")}${ASCII_WS}${escapeAsciiCaseInsensitive("anything")}${ASCII_WS}${escapeAsciiCaseInsensitive("now")}\b`,
      String.raw`\b(?:${ciAlt("enter", "activate")}${ASCII_WS}${ciAlt("developer", "jailbreak", "unrestricted")}${ASCII_WS}${escapeAsciiCaseInsensitive("mode")}|${ciAlt("jailbreak", "jailbroken")}${ASCII_WS}${ciAlt("mode", "prompt")})\b`,
      String.raw`\b${escapeAsciiCaseInsensitive("you")}${ASCII_WS}${escapeAsciiCaseInsensitive("are")}${ASCII_WS}${escapeAsciiCaseInsensitive("no")}${ASCII_WS}${escapeAsciiCaseInsensitive("longer")}${ASCII_WS}${ciAlt("bound", "restricted", "limited")}${ASCII_WS}${escapeAsciiCaseInsensitive("by")}${ASCII_WS}(?:${ciAlt("your", "the", "any", "those", "these")}${ASCII_WS})?(?:${ciAlt("safety", "security", "ethical", "content", "previous", "prior", "original", "system")}${ASCII_WS})?(?:${ciPluralAlt("rule", "guideline", "constraint", "restriction", "instruction", "guardrail")}|${ciAlt("policies", "policy")})\b`,
      String.raw`\b${escapeAsciiCaseInsensitive("act")}${ASCII_WS}${escapeAsciiCaseInsensitive("as")}${ASCII_WS}${escapeAsciiCaseInsensitive("if")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("you")}(?:'${escapeAsciiCaseInsensitive("re")}|${ASCII_WS}${escapeAsciiCaseInsensitive("are")})${ASCII_WS})?${escapeAsciiCaseInsensitive("not")}${ASCII_WS}${escapeAsciiCaseInsensitive("bound")}\b`,
      String.raw`\b${ciAlt("bypass", "disable", "ignore", "disregard")}${ASCII_WS}(?:${escapeAsciiCaseInsensitive("all")}${ASCII_WS})?(?:${escapeAsciiCaseInsensitive("your")}${ASCII_WS})?${ciAlt("safety", "security", "ethical", "content")}${ASCII_WS}(?:${ciPluralAlt("filter", "measure", "guideline", "restriction", "guardrail")}|${ciAlt("policies", "policy")})\b`,
    ],
  },
  hidden_unicode: {
    group: "prompt_injection",
    patterns: [
      // Zero-width/invisible format chars and bidi controls (omitting U+200C ZWNJ and U+200D ZWJ
      // to avoid flagging Persian/Indic orthography and ZWJ emoji sequences); absorbs immediately
      // following Tag chars so LeftmostFirst redaction does not leave adjacent Tag runs unredacted.
      String.raw`[\u{00AD}\u{061C}\u{200B}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}][\u{00AD}\u{061C}\u{200B}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}\u{E0000}-\u{E007F}]*`,
      // Unicode Tag characters (U+E0000-U+E007F) not preceded by a black flag U+1F3F4.
      String.raw`(?:^|[^\u{1F3F4}\u{E0000}-\u{E007F}])(?<__lf_match>[\u{E0000}-\u{E007F}]+)`,
      // Non-flag Tag runs preceded by U+1F3F4 (leaves valid subdivision flags U+1F3F4 + 2-6 [0-9a-z] tags + U+E007F untouched).
      String.raw`\u{1F3F4}(?<__lf_match>(?:[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{0,1}\u{E007F}[\u{E0000}-\u{E007F}]*|[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{2,6}\u{E007F}[\u{E0000}-\u{E007F}]+|[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{0,6}[\u{E0000}-\u{E002F}\u{E003A}-\u{E0060}\u{E007B}-\u{E007E}][\u{E0000}-\u{E007F}]*|[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{7,}[\u{E0000}-\u{E007F}]*|[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{1,6}))(?:$|[^\u{E0000}-\u{E007F}])`,
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
  prompt_injection: GATEWAY_GUARDRAIL_PRESET_KEYS.filter(
    (key) => GATEWAY_GUARDRAIL_PRESETS[key].group === "prompt_injection",
  ),
};

export const GatewayGuardrailPresetSchema = z.enum(
  GATEWAY_GUARDRAIL_PRESET_KEYS,
);

/** Printable ASCII without whitespace (0x21-0x7E). */
export const PRINTABLE_ASCII_NO_WHITESPACE_REGEX = /^[\x21-\x7E]+$/;

/** Printable ASCII including spaces (0x20-0x7E). */
export const PRINTABLE_ASCII_TEXT_REGEX = /^[\x20-\x7E]+$/;

const EXTERNAL_GUARDRAIL_API_KEY_MAX_LENGTH = 8192;

// Matches AWS Bedrock ApplyGuardrail URI parameter constraints and GatewayBedrockConfigSchema.
const BEDROCK_GUARDRAIL_ID_MAX_LENGTH = 2048;
const BEDROCK_GUARDRAIL_ID_REGEX =
  /^(?:[a-z0-9]+|arn:aws(?:-[a-z0-9-]+)?:bedrock:[a-z0-9-]{1,20}:[0-9]{12}:guardrail\/[a-z0-9]+)$/;
const BEDROCK_GUARDRAIL_VERSION_REGEX = /^(?:[1-9][0-9]{0,7}|DRAFT)$/;
const BEDROCK_AWS_REGION_REGEX = /^[a-z]{2}(-[a-z]+)+-[0-9]+$/;

export const GatewayBedrockGuardrailConfigSchema = z.object({
  guardrailId: z
    .string()
    .trim()
    .min(1, "Enter a Bedrock guardrail ID or ARN")
    .max(
      BEDROCK_GUARDRAIL_ID_MAX_LENGTH,
      `Guardrail ID must be at most ${BEDROCK_GUARDRAIL_ID_MAX_LENGTH} characters`,
    )
    .regex(
      BEDROCK_GUARDRAIL_ID_REGEX,
      "Enter a valid Bedrock guardrail ID (lowercase alphanumeric) or ARN",
    ),
  guardrailVersion: z
    .string()
    .trim()
    .min(1, "Enter a guardrail version")
    .regex(
      BEDROCK_GUARDRAIL_VERSION_REGEX,
      "Enter a version number (e.g. 1) or DRAFT",
    ),
  region: z
    .string()
    .trim()
    .min(1, "Select an AWS region")
    .regex(BEDROCK_AWS_REGION_REGEX, "Select a valid AWS region"),
});

export type GatewayBedrockGuardrailConfig = z.infer<
  typeof GatewayBedrockGuardrailConfigSchema
>;

/** API key of an external guardrail provider, sent as a bearer token. */
export const GatewayExternalGuardrailApiKeySchema = z
  .string()
  .trim()
  .min(1, "Enter an API key")
  .max(
    EXTERNAL_GUARDRAIL_API_KEY_MAX_LENGTH,
    `API key must be at most ${EXTERNAL_GUARDRAIL_API_KEY_MAX_LENGTH} characters`,
  )
  .refine(
    (value) => PRINTABLE_ASCII_NO_WHITESPACE_REGEX.test(value),
    "API key must be printable ASCII with no whitespace",
  );

export const GatewayBedrockGuardrailCreateInputSchema =
  GatewayBedrockGuardrailConfigSchema.extend({
    apiKey: GatewayExternalGuardrailApiKeySchema,
  });

export const GatewayBedrockGuardrailUpdateInputSchema =
  GatewayBedrockGuardrailConfigSchema.extend({
    apiKey: GatewayExternalGuardrailApiKeySchema.optional(),
  });

/** OpenAI data-residency regions; the gateway maps each to its API host. */
export const GATEWAY_OPENAI_MODERATION_REGIONS = ["us", "eu"] as const;

export const GatewayOpenAiModerationGuardrailConfigSchema = z.object({
  region: z.enum(GATEWAY_OPENAI_MODERATION_REGIONS),
});

export type GatewayOpenAiModerationGuardrailConfig = z.infer<
  typeof GatewayOpenAiModerationGuardrailConfigSchema
>;

export const GatewayOpenAiModerationGuardrailCreateInputSchema =
  GatewayOpenAiModerationGuardrailConfigSchema.extend({
    apiKey: GatewayExternalGuardrailApiKeySchema,
  });

export const GatewayOpenAiModerationGuardrailUpdateInputSchema =
  GatewayOpenAiModerationGuardrailConfigSchema.extend({
    apiKey: GatewayExternalGuardrailApiKeySchema.optional(),
  });

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

export const GatewayGuardrailCustomRegexSchema = z
  .string()
  .min(1, "Enter a regular expression")
  .max(
    GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH,
    `Regular expression must be at most ${GATEWAY_GUARDRAIL_MAX_CUSTOM_REGEX_LENGTH} characters`,
  );

type GuardrailTypeCapability = {
  readonly actions: readonly [
    GatewayGuardrailAction,
    ...GatewayGuardrailAction[],
  ];
  readonly defaultAction: GatewayGuardrailAction;
  readonly supportsRedactionLabel: boolean;
};

/**
 * Single control-plane source of truth for what each guardrail type supports.
 * The gateway itself stays action-agnostic and executes whatever action the
 * control plane resolves.
 */
export const GATEWAY_GUARDRAIL_TYPE_CAPABILITIES = {
  REGEX: {
    actions: ["BLOCK", "REDACT", "LOG"],
    defaultAction: "BLOCK",
    supportsRedactionLabel: true,
  },
  BEDROCK: {
    actions: ["ENFORCE", "LOG"],
    defaultAction: "ENFORCE",
    supportsRedactionLabel: false,
  },
  // Moderation returns verdicts without spans, so it cannot redact.
  OPENAI_MODERATION: {
    actions: ["BLOCK", "LOG"],
    defaultAction: "BLOCK",
    supportsRedactionLabel: false,
  },
} as const satisfies Record<GatewayGuardrailType, GuardrailTypeCapability>;

export type GatewayGuardrailActionForType<T extends GatewayGuardrailType> =
  (typeof GATEWAY_GUARDRAIL_TYPE_CAPABILITIES)[T]["actions"][number];

/** All actions the management UI offers across guardrail types. */
export type GatewayGuardrailUiAction =
  GatewayGuardrailActionForType<GatewayGuardrailType>;

export function resolveSupportedGuardrailAction<T extends GatewayGuardrailType>(
  type: T,
  action: GatewayGuardrailAction,
): GatewayGuardrailActionForType<T> {
  const capability = GATEWAY_GUARDRAIL_TYPE_CAPABILITIES[type];
  return (capability.actions as readonly GatewayGuardrailAction[]).includes(
    action,
  )
    ? (action as GatewayGuardrailActionForType<T>)
    : capability.defaultAction;
}

export const GatewayGuardrailScopeSchema = z.enum(GATEWAY_GUARDRAIL_SCOPES);

/** Evaluation scopes permitted per guardrail action. Blocking only evaluates the last turn on input. */
export const GATEWAY_GUARDRAIL_ACTION_SCOPES = {
  BLOCK: ["LAST_TURN", "OUTPUT", "LAST_TURN_AND_OUTPUT"],
  LOG: GATEWAY_GUARDRAIL_SCOPES,
  REDACT: GATEWAY_GUARDRAIL_SCOPES,
  ENFORCE: GATEWAY_GUARDRAIL_SCOPES,
} as const satisfies Record<
  GatewayGuardrailAction,
  readonly [GatewayGuardrailScope, ...GatewayGuardrailScope[]]
>;

export function supportsEntireInputScope(
  action: GatewayGuardrailAction,
): boolean {
  return (
    GATEWAY_GUARDRAIL_ACTION_SCOPES[action] as readonly GatewayGuardrailScope[]
  ).includes("ENTIRE_INPUT");
}

export function guardrailScopeChecksOutput(
  scope: GatewayGuardrailScope,
): boolean {
  return (
    scope === "OUTPUT" ||
    scope === "LAST_TURN_AND_OUTPUT" ||
    scope === "ENTIRE_INPUT_AND_OUTPUT"
  );
}

export function resolveSupportedGuardrailScope(
  action: GatewayGuardrailAction,
  scope: GatewayGuardrailScope,
): GatewayGuardrailScope {
  if (supportsEntireInputScope(action)) return scope;
  if (scope === "ENTIRE_INPUT") return "LAST_TURN";
  if (scope === "ENTIRE_INPUT_AND_OUTPUT") return "LAST_TURN_AND_OUTPUT";
  return scope;
}

export const GatewayGuardrailRedactionLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a replacement label")
  .max(
    GATEWAY_GUARDRAIL_MAX_REDACTION_LABEL_LENGTH,
    `Replacement label must be at most ${GATEWAY_GUARDRAIL_MAX_REDACTION_LABEL_LENGTH} characters`,
  )
  .regex(
    /^[^\p{Cc}]*$/u,
    "Replacement label cannot contain control characters or line breaks",
  );

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
  customRegex: z.string().optional(),
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

/**
 * Compiles one custom secret prefix into an ASCII-mode regex matching the
 * escaped prefix + >=16 token chars, bounded by explicit non-token characters.
 */
function compileSecretPrefixPattern(prefix: string): string {
  const escaped = escapeRegexLiteral(prefix);
  return `(?:^|[^A-Za-z0-9_-])(?<__lf_match>${escaped}[A-Za-z0-9_-]{${GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH},})(?:$|[^A-Za-z0-9_-])`;
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
  return `(?:^|[^A-Za-z0-9_])(?<__lf_match>(?:${alternatives.join("|")}))(?:$|[^A-Za-z0-9_])`;
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
  customRegex?: string | null;
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
  if (config.customRegex && config.customRegex.length > 0) {
    patterns.push(config.customRegex);
  }
  return patterns;
}
