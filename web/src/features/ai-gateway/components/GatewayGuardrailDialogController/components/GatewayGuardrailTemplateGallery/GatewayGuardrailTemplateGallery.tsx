import { ChevronRight } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { cn } from "@/src/utils/tailwind";

import styles from "./GatewayGuardrailTemplateGallery.module.css";

export type GatewayGuardrailTemplateGalleryProps = {
  onSelectTemplate: (template: GatewayGuardrailTemplate) => void;
};

/** Built-in guardrail template picker, styled after the evaluator template gallery. */
export function GatewayGuardrailTemplateGallery({
  onSelectTemplate,
}: GatewayGuardrailTemplateGalleryProps) {
  return (
    <Dialog title="Add a guardrail" size="lg" closeOnInteractionOutside>
      <p className="bg-modal text-muted-foreground relative -mt-3 shrink-0 border-b px-4 pb-3 text-xs">
        Choose what to detect.
      </p>
      <Dialog.Body>
        <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-3">
          {GATEWAY_GUARDRAIL_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

type TemplateCardProps = {
  template: GatewayGuardrailTemplate;
  onSelect: (template: GatewayGuardrailTemplate) => void;
};

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const handleSelect = () => onSelect(template);

  return (
    <button
      type="button"
      onClick={handleSelect}
      className="focus-visible:ring-ring h-full w-full cursor-pointer rounded-lg bg-transparent p-0 text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      <div
        className={cn(
          styles.card,
          "group/card bg-popover relative flex h-full flex-col overflow-hidden rounded-lg border text-left transition-shadow",
        )}
      >
        <div className="px-3 pt-3">
          <div
            aria-hidden="true"
            className={cn(
              styles.preview,
              "flex h-24 items-center justify-center overflow-hidden rounded-md px-3",
            )}
          >
            <span className="bg-popover/95 border-border/60 flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-xs shadow-2xs">
              <span className="text-muted-foreground shrink-0">
                {template.preview.label}:
              </span>
              <span
                className="text-foreground truncate font-medium"
                title={template.preview.value}
              >
                {template.preview.value}
              </span>
            </span>
            <div className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white backdrop-blur-xs group-hover/card:flex">
              <span className="flex items-center gap-1 text-sm font-bold">
                Configure
                <ChevronRight size="base" __rawClassName="translate-y-px" />
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 px-3 pt-3 pb-3.5">
          <span
            className="text-foreground text-sm font-bold"
            title={template.name}
          >
            {template.name}
          </span>
          <p
            className="text-muted-foreground text-xs leading-relaxed"
            title={template.description}
          >
            {template.description}
          </p>
        </div>
      </div>
    </button>
  );
}
