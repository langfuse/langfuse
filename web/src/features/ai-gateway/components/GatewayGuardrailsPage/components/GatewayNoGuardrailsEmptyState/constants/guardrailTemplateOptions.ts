import {
  IdCard,
  KeyRound,
  Regex,
  ShieldAlert,
  TextSearch,
  type IconComponent,
} from "@langfuse/icons";
import { AwsColorMark } from "@langfuse/icons/brand";
import { SiOpenai } from "@langfuse/icons/si";

import type { GatewayGuardrailTemplateKind } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";

export type GuardrailTemplateOption = {
  id: GatewayGuardrailTemplateKind;
  title: string;
  hint: string;
  icon: IconComponent;
};

/** Display order and distinct icons for the empty-state guardrail options. */
export const GUARDRAIL_TEMPLATE_OPTIONS: readonly GuardrailTemplateOption[] = [
  {
    id: "pii",
    title: "PII",
    hint: "Emails, SSNs, cards",
    icon: IdCard,
  },
  {
    id: "secrets",
    title: "Secrets and API keys",
    hint: "Keys, tokens, JWTs",
    icon: KeyRound,
  },
  {
    id: "prompt_injection",
    title: "Prompt injection",
    hint: "Heuristic phrases",
    icon: ShieldAlert,
  },
  {
    id: "custom_regex",
    title: "Custom regex",
    hint: "Your own pattern",
    icon: Regex,
  },
  {
    id: "contains",
    title: "Keyword list",
    hint: "Words and phrases",
    icon: TextSearch,
  },
  {
    id: "bedrock",
    title: "Amazon Bedrock",
    hint: "Guardrail ID & key",
    icon: AwsColorMark,
  },
  {
    id: "openai_moderation",
    title: "OpenAI Moderation",
    hint: "Harmful content & key",
    icon: SiOpenai,
  },
];
