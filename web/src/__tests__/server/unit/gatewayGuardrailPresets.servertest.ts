import { preview, validate } from "@langfuse/ai-gateway-guardrail-rules";
import { describe, expect, it } from "vitest";

import {
  GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
  GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
} from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  compileGuardrailConfigPatterns,
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  GATEWAY_GUARDRAIL_PRESETS_BY_GROUP,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

describe("GATEWAY_GUARDRAIL_PRESETS Rust WASM validation", () => {
  it("validates every preset individually, every group within the 128 KiB rule limit, and all presets within the 512 KiB org limit", () => {
    for (const preset of GATEWAY_GUARDRAIL_PRESET_KEYS) {
      const patterns = compileGuardrailConfigPatterns({ presets: [preset] });
      const report = validate(patterns, GATEWAY_GUARDRAIL_MAX_RULE_BYTES);
      expect(report.ok, `preset ${preset} failed validation`).toBe(true);
      expect(report.set_bytes).toBeGreaterThan(0);
      expect(report.set_bytes).toBeLessThanOrEqual(
        GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
      );
    }

    for (const [group, presets] of Object.entries(
      GATEWAY_GUARDRAIL_PRESETS_BY_GROUP,
    )) {
      const patterns = compileGuardrailConfigPatterns({ presets });
      const report = validate(patterns, GATEWAY_GUARDRAIL_MAX_RULE_BYTES);
      expect(report.ok, `group ${group} exceeded rule limit`).toBe(true);
      expect(report.set_bytes).toBeLessThanOrEqual(
        GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
      );
    }

    const allPatterns = compileGuardrailConfigPatterns({
      presets: GATEWAY_GUARDRAIL_PRESET_KEYS,
    });
    const orgReport = validate(allPatterns, GATEWAY_GUARDRAIL_MAX_ORG_BYTES);
    expect(orgReport.ok).toBe(true);
    expect(orgReport.set_bytes).toBeLessThanOrEqual(
      GATEWAY_GUARDRAIL_MAX_ORG_BYTES,
    );
  });

  it("matches hidden Unicode code point ranges (zero-width, bidi, U+E0000-U+E007F) in the Rust WASM engine without flagging ZWJ emoji, ZWNJ text, or subdivision flags", () => {
    const patterns = GATEWAY_GUARDRAIL_PRESETS.hidden_unicode.patterns;
    const sample =
      "a\u200Bb \u202Ec\u202C \u{E0041}\u{E0042} \u200B\u{E0043}\u{E0044} 🏴\u{E0049}\u{E0067} plain";
    const matched = patterns.flatMap((pattern) => {
      const result = preview(pattern, sample, GATEWAY_GUARDRAIL_MAX_RULE_BYTES);
      expect(result.valid).toBe(true);
      expect(result.truncated).toBe(false);
      return result.matches.map(({ start, end }) => sample.slice(start, end));
    });
    expect(matched).toEqual([
      "\u200B",
      "\u202E",
      "\u202C",
      "\u200B\u{E0043}\u{E0044}",
      " \u{E0041}\u{E0042}",
      "\u200B\u{E0043}\u{E0044}",
      "🏴\u{E0049}\u{E0067} ",
    ]);

    const benign =
      "Plain ASCII, café, 日本語, می\u200Cخواهم, 😀 🇬🇧 👨‍👩‍👧‍👦 👩‍💻 🏳️‍🌈 🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    for (const pattern of patterns) {
      const benignResult = preview(
        pattern,
        benign,
        GATEWAY_GUARDRAIL_MAX_RULE_BYTES,
      );
      expect(benignResult.valid).toBe(true);
      expect(benignResult.matches).toEqual([]);
    }
  });
});
