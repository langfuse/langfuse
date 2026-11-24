import {
  GATEWAY_GUARDRAIL_PRESETS_BY_GROUP,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GatewayGuardrailTemplateKind = "pii" | "secrets" | "contains";

export type GatewayGuardrailTemplate = {
  id: GatewayGuardrailTemplateKind;
  name: string;
  description: string;
  preview: {
    label: string;
    value: string;
  };
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
      name: "PII",
      description:
        "Detects emails, SSNs, credit cards, IBANs and IP addresses.",
      preview: {
        label: "email",
        value: "dana@example.com",
      },
      presets: GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.pii,
      defaultPresets: ["us_ssn", "credit_card", "email"],
      sampleTestText:
        "My SSN is 123-45-6789, reach me at dana@example.com from 192.168.1.42.",
    },
    {
      id: "secrets",
      name: "Secrets and API keys",
      description: "Detects API keys, access tokens, JWTs and private keys.",
      preview: {
        label: "openai_key",
        value: "sk-proj-4f9a...",
      },
      presets: GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.secrets,
      defaultPresets: [...GATEWAY_GUARDRAIL_PRESETS_BY_GROUP.secrets],
      sampleTestText:
        "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234",
    },
    {
      id: "contains",
      name: "Keyword list",
      description: "Detects words and phrases you define, like codenames.",
      preview: {
        label: "keyword",
        value: "Falcon",
      },
      presets: [],
      defaultPresets: [],
      sampleTestText:
        "This document mentions Project Falcon and is internal only.",
    },
  ];
