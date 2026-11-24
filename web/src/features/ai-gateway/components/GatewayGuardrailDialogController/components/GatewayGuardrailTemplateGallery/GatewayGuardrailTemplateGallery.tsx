import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
} from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";

export type GatewayGuardrailTemplateGalleryProps = {
  onSelectTemplate: (template: GatewayGuardrailTemplate) => void;
};

/** Built-in guardrail template picker, styled after the evaluator template gallery. */
export function GatewayGuardrailTemplateGallery({
  onSelectTemplate,
}: GatewayGuardrailTemplateGalleryProps) {
  return (
    <Dialog title="Add guardrail" size="md" closeOnInteractionOutside>
      <Dialog.Body>
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h4 className="text-foreground text-sm font-bold">Built-in</h4>
            <p className="text-muted-foreground text-xs">
              Run inside the gateway. No extra setup.
            </p>
          </div>
          <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
            {GATEWAY_GUARDRAIL_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={onSelectTemplate}
              />
            ))}
          </div>
        </section>
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
      className="bg-popover hover:border-foreground/30 hover:bg-accent/40 focus-visible:ring-ring flex h-full w-full cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    >
      <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold">
        {template.badge}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          title={template.name}
          className="text-foreground truncate text-sm font-bold"
        >
          {template.name}
        </span>
        <span
          title={template.description}
          className="text-muted-foreground truncate text-xs leading-snug"
        >
          {template.description}
        </span>
      </span>
    </button>
  );
}
