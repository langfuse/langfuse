import { GATEWAY_GUARDRAIL_PRESET_LABELS } from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";

const MAX_INLINE_LABELS = 3;

/** Badge and subtitle describing a guardrail's presets, custom prefixes, or keyword list. */
export function formatGuardrailPresetsSummary(config: {
  presets: readonly GatewayGuardrailPreset[];
  secretPrefixes?: readonly string[];
  containsWords?: readonly string[];
}) {
  const presets = config.presets;
  const secretPrefixes = config.secretPrefixes ?? [];
  const containsWords = config.containsWords ?? [];

  if (
    presets.length === 0 &&
    secretPrefixes.length === 0 &&
    containsWords.length > 0
  ) {
    const preview = containsWords.slice(0, 2).join(", ");
    const extra =
      containsWords.length > 2 ? ` +${containsWords.length - 2} more` : "";
    return {
      badge: "Aa",
      subtitle: `Keyword blocklist · ${preview}${extra}`,
    };
  }

  const isSecrets =
    secretPrefixes.length > 0 ||
    (presets.length > 0 &&
      presets.every(
        (preset) => GATEWAY_GUARDRAIL_PRESETS[preset].group === "secrets",
      ));

  const labels = presets.map(
    (preset) => GATEWAY_GUARDRAIL_PRESET_LABELS[preset],
  );
  const visible = labels.slice(0, MAX_INLINE_LABELS);
  const hiddenCount = labels.length - visible.length;
  const presetText =
    hiddenCount > 0
      ? `${visible.join(", ")} +${hiddenCount} more`
      : visible.join(", ");

  if (isSecrets) {
    const parts: string[] = [];
    if (presetText) parts.push(presetText);
    if (secretPrefixes.length > 0) {
      parts.push(
        `${secretPrefixes.length} custom ${secretPrefixes.length === 1 ? "prefix" : "prefixes"}`,
      );
    }
    return {
      badge: "***",
      subtitle:
        parts.length > 0
          ? `Secret detection · ${parts.join(", ")}`
          : "Secret detection",
    };
  }

  return {
    badge: "PII",
    subtitle: presetText ? `PII · ${presetText}` : "PII",
  };
}
