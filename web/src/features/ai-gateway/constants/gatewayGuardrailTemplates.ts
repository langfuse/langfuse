import type { GatewayGuardrailAction } from "@langfuse/shared/src/db";

import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";

type GatewayGuardrailTemplateId = "pii" | "secrets";

export type GatewayGuardrailTemplate = {
  id: GatewayGuardrailTemplateId;
  badge: string;
  name: string;
  description: string;
  presets: readonly GatewayGuardrailPreset[];
  defaultPresets: readonly GatewayGuardrailPreset[];
  sampleTestText: string;
};

export const GATEWAY_GUARDRAIL_PRESET_LABELS: Record<
  GatewayGuardrailPreset,
  string
> = {
  us_ssn: "US SSN",
  credit_card: "Credit card",
  email: "Email",
  iban: "IBAN",
  aws_access_key_id: "AWS access key ID",
};

export const GATEWAY_GUARDRAIL_TEMPLATES: readonly GatewayGuardrailTemplate[] =
  [
    {
      id: "pii",
      badge: "PII",
      name: "PII detection",
      description: "SSNs, credit cards, emails, IBANs",
      presets: ["us_ssn", "credit_card", "email", "iban"],
      defaultPresets: ["us_ssn", "credit_card", "email"],
      sampleTestText:
        "My SSN is 123-45-6789, reach me at dana@example.com or IBAN DE89370400440532013000.",
    },
    {
      id: "secrets",
      badge: "***",
      name: "Secret detection",
      description: "AWS access key IDs",
      presets: ["aws_access_key_id"],
      defaultPresets: ["aws_access_key_id"],
      sampleTestText: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
    },
  ];

export const GATEWAY_GUARDRAIL_ACTION_LABELS: Record<
  GatewayGuardrailAction,
  string
> = {
  BLOCK: "Block",
  LOG: "Log",
  REDACT: "Mask",
};

export const GATEWAY_GUARDRAIL_INTERVALS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export type GatewayGuardrailInterval =
  (typeof GATEWAY_GUARDRAIL_INTERVALS)[number]["value"];
