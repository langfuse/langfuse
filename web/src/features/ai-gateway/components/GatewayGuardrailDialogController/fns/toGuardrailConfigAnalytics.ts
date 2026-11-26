import type {
  GatewayGuardrailAction,
  GatewayGuardrailAssignmentScope,
  GatewayGuardrailScope,
  GatewayGuardrailType,
} from "@langfuse/shared";

import { GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import type { GatewayGuardrailConfigAnalytics } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import {
  isKnownGuardrailPreset,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { summarizeGuardrailAssignments } from "./summarizeGuardrailAssignments";

type GuardrailConfigAnalyticsInput = {
  template: GatewayGuardrailTemplateKind;
  guardrail: {
    type: GatewayGuardrailType;
    action: GatewayGuardrailAction;
    scope: GatewayGuardrailScope;
    presets: readonly string[];
    secretPrefixes: readonly unknown[];
    containsWords: readonly unknown[];
    customRegex: string | null;
    redactionLabel: string | null;
    assignments: readonly { scope: GatewayGuardrailAssignmentScope }[];
  };
};

export function toGuardrailConfigAnalytics({
  template,
  guardrail,
}: GuardrailConfigAnalyticsInput): GatewayGuardrailConfigAnalytics {
  const presets = Array.from(
    new Set(guardrail.presets.filter(isKnownGuardrailPreset)),
  ).sort();

  return {
    template,
    guardrailType: guardrail.type,
    isExternal: guardrail.type !== "REGEX",
    action: guardrail.action,
    scope: guardrail.scope,
    presets,
    presetCount: presets.length,
    customSecretPrefixCount: guardrail.secretPrefixes.length,
    keywordCount: guardrail.containsWords.length,
    hasCustomRegex: Boolean(guardrail.customRegex),
    hasCustomRedactionLabel:
      guardrail.action === "REDACT" &&
      guardrail.redactionLabel !== null &&
      guardrail.redactionLabel !== GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
    ...summarizeGuardrailAssignments(guardrail.assignments),
  };
}
