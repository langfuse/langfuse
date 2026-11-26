import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import type { GatewayGuardrailTemplateKind } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";
import { GuardrailTemplateCard } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/components/GuardrailTemplateCard";
import { NoGuardrailsFrame } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/components/NoGuardrailsFrame";
import { NoGuardrailsTemplateList } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/components/NoGuardrailsTemplateList";
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
      <NoGuardrailsFrame
        description="Ask your organization admin to add a guardrail to check prompts and responses passing through the gateway."
        actions={
          <Button
            variant="outline"
            text="About guardrails"
            href={GATEWAY_GUARDRAILS_DOCS_URL}
          />
        }
      >
        <NoGuardrailsTemplateList>
          {GUARDRAIL_TEMPLATE_OPTIONS.map(({ id, title, hint, icon }) => (
            <li key={id}>
              <GuardrailTemplateCard
                templateKind={id}
                title={title}
                hint={hint}
                icon={icon}
              />
            </li>
          ))}
        </NoGuardrailsTemplateList>
      </NoGuardrailsFrame>
    );
  }

  return (
    <NoGuardrailsFrame
      description="Guardrails check prompts and responses as they pass through the gateway. On a match, they mask the value, block the request or log it."
      actions={
        <>
          <Button
            variant="outline"
            text="Setup guide"
            href={GATEWAY_GUARDRAILS_DOCS_URL}
          />
          <Button
            text="Add guardrail"
            icon={Plus}
            onClick={props.onAddGuardrail}
          />
        </>
      }
    >
      <NoGuardrailsTemplateList>
        {GUARDRAIL_TEMPLATE_OPTIONS.map(({ id, title, hint, icon }) => (
          <li key={id}>
            <GuardrailTemplateCard
              templateKind={id}
              title={title}
              hint={hint}
              icon={icon}
              onSelect={props.onSelectTemplate}
            />
          </li>
        ))}
      </NoGuardrailsTemplateList>
    </NoGuardrailsFrame>
  );
}
