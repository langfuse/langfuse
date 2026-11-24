import {
  GATEWAY_GUARDRAIL_PRESETS,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GuardrailTestSegment = {
  text: string;
  matched: boolean;
};

// Precompiled once from static built-in presets so no runtime argument ever reaches RegExp().
const COMPILED_PRESET_REGEXES: Record<GatewayGuardrailPreset, RegExp[]> = {
  email: [],
  us_ssn: [],
  credit_card: [],
  iban: [],
  aws_access_key_id: [],
};

for (const preset of Object.keys(
  GATEWAY_GUARDRAIL_PRESETS,
) as GatewayGuardrailPreset[]) {
  for (const pattern of GATEWAY_GUARDRAIL_PRESETS[preset]) {
    COMPILED_PRESET_REGEXES[preset].push(new RegExp(pattern, "g"));
  }
}

/**
 * Matches `text` client-side against the selected built-in presets' regex
 * patterns and returns contiguous highlighted/plain segments.
 */
export function findGuardrailMatches(
  text: string,
  presets: readonly GatewayGuardrailPreset[],
): GuardrailTestSegment[] {
  if (!text) return [];
  const regexes = presets.flatMap((preset) =>
    Object.hasOwn(COMPILED_PRESET_REGEXES, preset)
      ? COMPILED_PRESET_REGEXES[preset]
      : [],
  );
  if (regexes.length === 0) return [{ text, matched: false }];

  const spans: Array<[number, number]> = [];
  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      spans.push([match.index, match.index + match[0].length]);
    }
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
