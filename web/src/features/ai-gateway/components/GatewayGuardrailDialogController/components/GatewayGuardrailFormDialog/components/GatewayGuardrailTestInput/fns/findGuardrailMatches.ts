import {
  GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH,
  GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  deduplicateContainsWords,
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  PRINTABLE_ASCII_NO_WHITESPACE_REGEX,
  PRINTABLE_ASCII_TEXT_REGEX,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GuardrailTestSegment = {
  text: string;
  matched: boolean;
};

// Precompiled once from static built-in presets so no runtime argument ever reaches RegExp().
const COMPILED_PRESET_REGEXES = Object.fromEntries(
  GATEWAY_GUARDRAIL_PRESET_KEYS.map((key) => [key, [] as RegExp[]]),
) as Record<GatewayGuardrailPreset, RegExp[]>;

for (const preset of GATEWAY_GUARDRAIL_PRESET_KEYS) {
  for (const pattern of GATEWAY_GUARDRAIL_PRESETS[preset].patterns) {
    COMPILED_PRESET_REGEXES[preset].push(new RegExp(pattern, "g"));
  }
}

/**
 * Matches `text` client-side against selected built-in presets, custom secret
 * prefixes, and contains word lists, returning contiguous highlight segments.
 */
export function findGuardrailMatches(
  text: string,
  config: {
    presets: readonly GatewayGuardrailPreset[];
    secretPrefixes?: readonly string[];
    containsWords?: readonly string[];
  },
): GuardrailTestSegment[] {
  if (!text) return [];

  const spans: Array<[number, number]> = [];

  collectPresetSpans(text, config.presets, spans);
  if (config.secretPrefixes && config.secretPrefixes.length > 0) {
    collectSecretPrefixSpans(text, config.secretPrefixes, spans);
  }
  if (config.containsWords && config.containsWords.length > 0) {
    collectContainsSpans(text, config.containsWords, spans);
  }

  if (spans.length === 0) return [{ text, matched: false }];

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of spans) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const segments: GuardrailTestSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), matched: false });
    }
    segments.push({ text: text.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matched: false });
  }
  return segments;
}

function collectPresetSpans(
  text: string,
  presets: readonly GatewayGuardrailPreset[],
  spans: Array<[number, number]>,
) {
  for (const preset of presets) {
    if (!Object.hasOwn(COMPILED_PRESET_REGEXES, preset)) continue;
    for (const regex of COMPILED_PRESET_REGEXES[preset]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }
        // When a pattern uses capture group 1 to exclude surrounding boundary chars (e.g. compressed IPv6),
        // highlight only group 1 and resume right after it so adjacent tokens still match.
        if (match[1] !== undefined) {
          const offset = match[0].indexOf(match[1]);
          const start = match.index + Math.max(0, offset);
          const end = start + match[1].length;
          spans.push([start, end]);
          regex.lastIndex = end;
          continue;
        }
        spans.push([match.index, match.index + match[0].length]);
      }
    }
  }
}

function isSecretTokenChar(code: number) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 || // _
    code === 45 // -
  );
}

/** Matches `<prefix>[A-Za-z0-9_-]{16,}` bounded by non-token characters, mirroring `compileSecretPrefixPattern`. */
function collectSecretPrefixSpans(
  text: string,
  prefixes: readonly string[],
  spans: Array<[number, number]>,
) {
  for (const prefix of prefixes) {
    if (
      prefix.length < GATEWAY_GUARDRAIL_SECRET_PREFIX_MIN_LENGTH ||
      prefix.length > GATEWAY_GUARDRAIL_SECRET_PREFIX_MAX_LENGTH ||
      !PRINTABLE_ASCII_NO_WHITESPACE_REGEX.test(prefix)
    ) {
      continue;
    }
    let searchFrom = 0;
    while (searchFrom <= text.length - prefix.length) {
      const idx = text.indexOf(prefix, searchFrom);
      if (idx === -1) break;
      const beforeOk =
        idx === 0 || !isSecretTokenChar(text.charCodeAt(idx - 1));
      if (beforeOk) {
        let end = idx + prefix.length;
        while (end < text.length && isSecretTokenChar(text.charCodeAt(end))) {
          end += 1;
        }
        if (
          end - (idx + prefix.length) >=
          GATEWAY_GUARDRAIL_SECRET_BODY_MIN_LENGTH
        ) {
          spans.push([idx, end]);
          searchFrom = end;
          continue;
        }
      }
      searchFrom = idx + 1;
    }
  }
}

function isAsciiWordChar(code: number) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

/** Matches ASCII case-insensitive whole words/phrases bounded by `[^A-Za-z0-9_]`, mirroring `compileContainsPattern`. */
function collectContainsSpans(
  text: string,
  words: readonly string[],
  spans: Array<[number, number]>,
) {
  const deduped = deduplicateContainsWords(words).filter((word) =>
    PRINTABLE_ASCII_TEXT_REGEX.test(word),
  );
  if (deduped.length === 0) return;

  // Lowercase ASCII letters only (matching ASCII-mode regex semantics).
  const lowerText = toAsciiLower(text);
  for (const word of deduped) {
    const needle = toAsciiLower(word);
    let searchFrom = 0;
    while (searchFrom <= lowerText.length - needle.length) {
      const idx = lowerText.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const end = idx + needle.length;
      const beforeOk = idx === 0 || !isAsciiWordChar(text.charCodeAt(idx - 1));
      const afterOk =
        end === text.length || !isAsciiWordChar(text.charCodeAt(end));
      if (beforeOk && afterOk) {
        spans.push([idx, end]);
      }
      searchFrom = idx + 1;
    }
  }
}

function toAsciiLower(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : value[i];
  }
  return out;
}
