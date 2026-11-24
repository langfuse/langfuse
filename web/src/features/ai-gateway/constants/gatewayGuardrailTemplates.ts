import type { GatewayGuardrailAction } from "@langfuse/shared/src/db";

import {
  GATEWAY_GUARDRAIL_PRESETS_BY_GROUP,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GatewayGuardrailTemplateKind = "pii" | "secrets" | "contains";

export type GatewayGuardrailTemplate = {
  id: GatewayGuardrailTemplateKind;
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
  ip_address: "IP address",
  aws_access_key_id: "AWS access key ID",
  langfuse_api_key: "Langfuse API key",
  openai_api_key: "OpenAI API key",
  anthropic_api_key: "Anthropic API key",
  github_token: "GitHub token",
  stripe_api_key: "Stripe API key",
  slack_token: "Slack token",
  google_api_key: "Google API key",
  private_key: "Private key",
  jwt: "JWT",
};

export const GATEWAY_GUARDRAIL_TEMPLATES: readonly GatewayGuardrailTemplate[] =
  [
    {
      id: "pii",
      badge: "PII",
      name: "PII detection",
      description: "SSNs, credit cards, emails, IBANs, IP addresses",
      presets: GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.pii,
      defaultPresets: ["us_ssn", "credit_card", "email"],
      sampleTestText:
        "My SSN is 123-45-6789, reach me at dana@example.com from 192.168.1.42.",
    },
    {
      id: "secrets",
      badge: "***",
      name: "Secret detection",
      description: "API keys, tokens, private keys, JWTs, custom prefixes",
      presets: GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.secrets,
      defaultPresets: [...GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.secrets],
      sampleTestText:
        "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234",
    },
    {
      id: "contains",
      badge: "Aa",
      name: "Keyword blocklist",
      description: "Match exact words or phrases",
      presets: [],
      defaultPresets: [],
      sampleTestText: "This document is confidential and internal only.",
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
