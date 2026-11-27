import { Plus } from "@langfuse/icons";

import { GatewayCatalogEmptyState } from "@/src/features/ai-gateway/components/GatewayCatalogEmptyState/GatewayCatalogEmptyState";
import type { GatewayGuardrailTemplateKind } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";
import { NoGuardrailsDiagram } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/components/NoGuardrailsDiagram";
import { GUARDRAIL_TEMPLATE_OPTIONS } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/constants/guardrailTemplateOptions";
import { GATEWAY_GUARDRAILS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export type GatewayNoGuardrailsEmptyStateProps =
  | {
      mode: "manage";
      onAddGuardrail: () => void;
      onSelectTemplate: (templateKind: GatewayGuardrailTemplateKind) => void;
    }
  | {
      mode: "readOnly";
    };

/** Shown until the organization has a guardrail configured. */
export function GatewayNoGuardrailsEmptyState(
  props: GatewayNoGuardrailsEmptyStateProps,
) {
  if (props.mode === "readOnly") {
    return (
      <GatewayCatalogEmptyState
        title="No guardrails yet"
        description="Ask your organization admin to add a guardrail to check prompts and responses passing through the gateway."
        actions={[
          {
            variant: "outline",
            text: "About guardrails",
            href: GATEWAY_GUARDRAILS_DOCS_URL,
          },
        ]}
        optionsHeading="Guardrails"
        options={GUARDRAIL_TEMPLATE_OPTIONS}
      >
        <NoGuardrailsDiagram />
      </GatewayCatalogEmptyState>
    );
  }

  return (
    <GatewayCatalogEmptyState
      title="No guardrails yet"
      description="Guardrails check prompts and responses as they pass through the gateway. On a match, they mask the value, block the request or log it."
      actions={[
        {
          variant: "outline",
          text: "Setup guide",
          href: GATEWAY_GUARDRAILS_DOCS_URL,
        },
        {
          text: "Add guardrail",
          icon: Plus,
          onClick: props.onAddGuardrail,
        },
      ]}
      optionsHeading="Guardrails"
      options={GUARDRAIL_TEMPLATE_OPTIONS.map((template) => ({
        ...template,
        actionLabel: "Configure",
        onSelect: () => props.onSelectTemplate(template.id),
      }))}
    >
      <NoGuardrailsDiagram />
    </GatewayCatalogEmptyState>
  );
}
