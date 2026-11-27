import { GATEWAY_GUARDRAIL_TEMPLATES } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  type GatewayGuardrailPreset,
  type GatewayGuardrailPresetGroup,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";

/**
 * The template a stored guardrail is edited and badged with, and the presets
 * its form offers. Regex guardrails are matched by the rules they hold.
 */
export function resolveGuardrailTemplate(
  guardrail: Pick<
    GatewayGuardrailRow,
    "type" | "presets" | "secretPrefixes" | "containsWords" | "customRegex"
  >,
): {
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
} {
  const external = GATEWAY_GUARDRAIL_TEMPLATES.find(
    (template) =>
      template.external && template.guardrailType === guardrail.type,
  );
  if (external) {
    return { templateKind: external.id, availablePresets: [] };
  }
  const { presets, secretPrefixes, containsWords, customRegex } = guardrail;
  if (
    presets.length === 0 &&
    secretPrefixes.length === 0 &&
    containsWords.length === 0 &&
    customRegex
  ) {
    return { templateKind: "custom_regex", availablePresets: [] };
  }
  if (
    presets.length === 0 &&
    secretPrefixes.length === 0 &&
    containsWords.length > 0
  ) {
    return { templateKind: "contains", availablePresets: [] };
  }
  const allInGroup = (group: GatewayGuardrailPresetGroup) =>
    presets.length > 0 &&
    presets.every(
      (preset) => GATEWAY_GUARDRAIL_PRESETS[preset].group === group,
    );
  if (secretPrefixes.length > 0 || allInGroup("secrets")) {
    return {
      templateKind: "secrets",
      availablePresets: templatePresets("secrets"),
    };
  }
  if (allInGroup("prompt_injection")) {
    return {
      templateKind: "prompt_injection",
      availablePresets: templatePresets("prompt_injection"),
    };
  }
  return {
    templateKind: "pii",
    availablePresets: allInGroup("pii")
      ? templatePresets("pii")
      : GATEWAY_GUARDRAIL_PRESET_KEYS,
  };
}

function templatePresets(templateKind: GatewayGuardrailTemplateKind) {
  return (
    GATEWAY_GUARDRAIL_TEMPLATES.find((template) => template.id === templateKind)
      ?.presets ?? GATEWAY_GUARDRAIL_PRESET_KEYS
  );
}
