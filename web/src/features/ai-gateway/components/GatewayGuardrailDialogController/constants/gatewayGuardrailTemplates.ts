import {
  GATEWAY_GUARDRAIL_PRESETS_BY_GROUP,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

export type GatewayGuardrailTemplateKind =
  | "pii"
  | "secrets"
  | "contains"
  | "custom_regex"
  | "bedrock";

export type GatewayGuardrailTemplatePreview =
  | { kind: "snippet"; label: string; value: string }
  | { kind: "logo"; provider: "aws" };

export type GatewayGuardrailTemplate = {
  id: GatewayGuardrailTemplateKind;
  name: string;
  description: string;
  preview: GatewayGuardrailTemplatePreview;
  /** Present for external guardrail providers evaluated over HTTP by the gateway. */
  external?: {
    description: string;
    docsLabel: string;
    docsHref: string;
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
        kind: "snippet",
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
        kind: "snippet",
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
        kind: "snippet",
        label: "keyword",
        value: "Falcon",
      },
      presets: [],
      defaultPresets: [],
      sampleTestText:
        "This document mentions Project Falcon and is internal only.",
    },
    {
      id: "custom_regex",
      name: "Custom regex",
      description: "Match your own regular expression.",
      preview: {
        kind: "snippet",
        label: "regex",
        value: String.raw`ORD-\d{6}`,
      },
      presets: [],
      defaultPresets: [],
      sampleTestText: "Order ORD-123456 is ready for pickup.",
    },
    {
      id: "bedrock",
      name: "Amazon Bedrock",
      description: "Evaluates prompts using your Amazon Bedrock guardrail.",
      preview: {
        kind: "logo",
        provider: "aws",
      },
      external: {
        description:
          "Runs each request's latest turn through your existing Amazon Bedrock guardrail.",
        docsLabel: "AWS documentation",
        docsHref:
          "https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html",
      },
      presets: [],
      defaultPresets: [],
      sampleTestText: "",
    },
  ];
