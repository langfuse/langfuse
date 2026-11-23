import { z } from "zod/v4";

/**
 * Built-in rules a regex guardrail can match. The gateway owns the patterns;
 * an id it does not know is skipped, so add ids to the gateway first.
 */
export const gatewayGuardrailPresets = [
  "email",
  "us_ssn",
  "credit_card",
  "iban",
  "aws_access_key_id",
] as const;
export type GatewayGuardrailPreset = (typeof gatewayGuardrailPresets)[number];

/** The stored `config` of a regex guardrail. */
export const GatewayRegexGuardrailConfigSchema = z.object({
  presets: z.array(z.enum(gatewayGuardrailPresets)).min(1),
});
