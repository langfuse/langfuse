import {
  IdCard,
  KeyRound,
  Regex,
  TextSearch,
  type IconComponent,
} from "@langfuse/icons";
import { AwsColorMark } from "@langfuse/icons/brand";

import type { GatewayGuardrailTemplateKind } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";

export type GuardrailTemplateOption = {
  id: GatewayGuardrailTemplateKind;
  title: string;
  hint: string;
  icon: IconComponent;
};

/** Display order and distinct icons for the empty-state guardrail templates. */
export const GUARDRAIL_TEMPLATE_OPTIONS: readonly GuardrailTemplateOption[] = [
  {
    id: "pii",
    title: "PII",
    hint: "Emails, SSNs, credit cards, IBANs, IPs",
    icon: IdCard,
  },
  {
    id: "secrets",
    title: "Secrets and API keys",
    hint: "API keys, tokens, JWTs, private keys",
    icon: KeyRound,
  },
  {
    id: "custom_regex",
    title: "Custom regex",
    hint: "Your own regular expression",
    icon: Regex,
  },
  {
    id: "contains",
    title: "Keyword list",
    hint: "Words and phrases you define",
    icon: TextSearch,
  },
  {
    id: "bedrock",
    title: "Amazon Bedrock Guardrails",
    hint: "Guardrail ID and Bedrock API key",
    icon: AwsColorMark,
  },
];
