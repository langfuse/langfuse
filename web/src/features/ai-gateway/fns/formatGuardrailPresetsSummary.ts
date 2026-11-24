import {
  GATEWAY_GUARDRAIL_PRESET_LABELS,
  GATEWAY_GUARDRAIL_TEMPLATES,
} from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";

const SECRET_PRESET_SET = new Set<GatewayGuardrailPreset>(
  GATEWAY_GUARDRAIL_TEMPLATES.find((template) => template.id === "secrets")
    ?.presets ?? [],
);

/** Badge and subtitle describing a guardrail's selected built-in presets. */
export function formatGuardrailPresetsSummary(
  presets: readonly GatewayGuardrailPreset[],
) {
  const isSecretsOnly =
    presets.length > 0 &&
    presets.every((preset) => SECRET_PRESET_SET.has(preset));
  const labels = presets.map(
    (preset) => GATEWAY_GUARDRAIL_PRESET_LABELS[preset],
  );

  if (isSecretsOnly) {
    return {
      badge: "***",
      subtitle:
        labels.length > 0
          ? `Secret detection · ${labels.join(", ")}`
          : "Secret detection",
    };
  }

  return {
    badge: "PII",
    subtitle: labels.length > 0 ? `PII · ${labels.join(", ")}` : "PII",
  };
}
