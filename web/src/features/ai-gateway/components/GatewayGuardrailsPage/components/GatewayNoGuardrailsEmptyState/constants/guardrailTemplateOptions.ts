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
];
