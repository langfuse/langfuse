import { GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  isKnownGuardrailPreset,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { summarizeGuardrailAssignments } from "./summarizeGuardrailAssignments";

export function toGuardrailConfigAnalytics({
  template,
  guardrail,
}: {
  template: GatewayGuardrailTemplateKind;
  guardrail: Pick<
    GatewayGuardrailRow,
    | "type"
    | "action"
    | "scope"
    | "secretPrefixes"
    | "containsWords"
    | "customRegex"
    | "redactionLabel"
  > & {
    presets: readonly string[];
    assignments: Parameters<typeof summarizeGuardrailAssignments>[0];
  };
}) {
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
