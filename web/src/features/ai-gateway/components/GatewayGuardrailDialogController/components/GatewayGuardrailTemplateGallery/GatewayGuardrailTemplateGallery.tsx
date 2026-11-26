import { ChevronRight } from "@langfuse/icons";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
  type GatewayGuardrailTemplatePreview,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { cn } from "@/src/utils/tailwind";

import styles from "./GatewayGuardrailTemplateGallery.module.css";

const BUILT_IN_TEMPLATES = GATEWAY_GUARDRAIL_TEMPLATES.filter(
  (template) => !template.external,
);
const INTEGRATION_TEMPLATES = GATEWAY_GUARDRAIL_TEMPLATES.filter((template) =>
  Boolean(template.external),
);
const SIZING_TEMPLATES =
  BUILT_IN_TEMPLATES.length >= INTEGRATION_TEMPLATES.length
    ? BUILT_IN_TEMPLATES
    : INTEGRATION_TEMPLATES;

export type GatewayGuardrailTemplateGalleryProps = {
  onSelectTemplate: (template: GatewayGuardrailTemplate) => void;
};

/** Guardrail template picker with Built-in and Integrations tabs. */
export function GatewayGuardrailTemplateGallery({
  onSelectTemplate,
}: GatewayGuardrailTemplateGalleryProps) {
  return (
    <Dialog title="Add a guardrail" size="lg" closeOnInteractionOutside>
      <p className="bg-modal text-muted-foreground relative -mt-3 shrink-0 border-b px-4 pb-3 text-xs">
        Choose what to detect.
      </p>
      <Tabs defaultValue="built-in" layout="fill">
        <Tabs.List
          variant="underline"
          aria-label="Guardrail template categories"
        >
          <Tabs.Trigger
            value="built-in"
            label="Built-in"
            count={BUILT_IN_TEMPLATES.length}
          />
          <Tabs.Trigger
            value="integrations"
            label="Integrations"
            count={INTEGRATION_TEMPLATES.length}
          />
        </Tabs.List>
        <Dialog.Body>
          <div className="grid">
            {/* Hidden sizer keeps modal height constant when switching tabs. */}
            <div
              aria-hidden="true"
              className="pointer-events-none invisible col-start-1 row-start-1 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {SIZING_TEMPLATES.map((template) => (
                <TemplateCardContent key={template.id} template={template} />
              ))}
            </div>
            <div className="col-start-1 row-start-1">
              <Tabs.Content value="built-in">
                <TemplateGrid
                  templates={BUILT_IN_TEMPLATES}
                  onSelectTemplate={onSelectTemplate}
                />
              </Tabs.Content>
              <Tabs.Content value="integrations">
                <TemplateGrid
                  templates={INTEGRATION_TEMPLATES}
                  onSelectTemplate={onSelectTemplate}
                />
              </Tabs.Content>
            </div>
          </div>
        </Dialog.Body>
      </Tabs>
    </Dialog>
  );
}

type TemplateGridProps = {
  templates: readonly GatewayGuardrailTemplate[];
  onSelectTemplate: (template: GatewayGuardrailTemplate) => void;
};

function TemplateGrid({ templates, onSelectTemplate }: TemplateGridProps) {
  return (
    <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onSelect={onSelectTemplate}
        />
      ))}
    </div>
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
      <TemplateCardContent template={template} />
    </button>
  );
}

function TemplateCardContent({
  template,
}: {
  template: GatewayGuardrailTemplate;
}) {
  return (
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
          <TemplatePreview preview={template.preview} />
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
  );
}

function TemplatePreview({
  preview,
}: {
  preview: GatewayGuardrailTemplatePreview;
}) {
  if (preview.kind === "logo") {
    switch (preview.provider) {
      case "aws":
        return <AwsColorLogo />;
    }
  }
  return (
    <span className="bg-popover/95 border-border/60 flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-xs shadow-2xs">
      <span className="text-muted-foreground shrink-0">{preview.label}:</span>
      <span
        className="text-foreground truncate font-medium"
        title={preview.value}
      >
        {preview.value}
      </span>
    </span>
  );
}

function AwsColorLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="text-foreground h-16 w-16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z"
      />
      <path
        fill="#FF9900"
        d="M21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.383.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z"
      />
    </svg>
  );
}
