import { z } from "zod/v4";

/**
 * Built-in rules a regex guardrail can use. Resolve sends the patterns, so the
 * gateway holds no preset logic and a pattern change ships with the control
 * plane. The gateway compiles them in ASCII mode without Unicode, so classes
 * are spelled out (no `(?i)`), and must not use lookaround or backreferences.
 */
export const GATEWAY_GUARDRAIL_PRESETS = {
  email: [
    String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b`,
  ],
  us_ssn: [
    String.raw`\b(?:00[1-9]|0[1-9]\d|[1-578]\d\d|6[0-57-9]\d|66[0-57-9])-(?:0[1-9]|[1-9]\d)-(?:000[1-9]|00[1-9]\d|0[1-9]\d\d|[1-9]\d{3})\b`,
  ],
  credit_card: [
    // Visa, Mastercard and Discover (16 digits), then American Express (15).
    String.raw`\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){3}\b`,
    String.raw`\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b`,
  ],
  iban: [
    String.raw`\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b`,
  ],
  aws_access_key_id: [String.raw`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`],
} as const satisfies Record<string, readonly string[]>;

export type GatewayGuardrailPreset = keyof typeof GATEWAY_GUARDRAIL_PRESETS;

const gatewayGuardrailPresets = Object.keys(GATEWAY_GUARDRAIL_PRESETS) as [
  GatewayGuardrailPreset,
  ...GatewayGuardrailPreset[],
];

/** The stored `config` of a regex guardrail. */
export const GatewayRegexGuardrailConfigSchema = z.object({
  presets: z.array(z.enum(gatewayGuardrailPresets)).min(1),
});
