import { ChevronRight, type IconComponent } from "@langfuse/icons";
import { cva } from "class-variance-authority";

import type { GatewayGuardrailTemplateKind } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";

import styles from "./guardrailTemplateCard.module.css";

const cardVariants = cva(
  // One step above `rounded-lg`, so the card reads rounder than its 8px tile.
  "bg-card flex w-full items-center rounded-[calc(var(--radius)+2px)] border p-4 text-left",
  {
    variants: {
      interactive: {
        true: [
          styles.interactive,
          "focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
        ],
        false: "",
      },
    },
  },
);

export type GuardrailTemplateCardProps = {
  templateKind: GatewayGuardrailTemplateKind;
  title: string;
  hint: string;
  icon: IconComponent;
  /** Makes the card a button that opens guardrail creation for this template. */
  onSelect?: (templateKind: GatewayGuardrailTemplateKind) => void;
};

export function GuardrailTemplateCard({
  templateKind,
  title,
  hint,
  icon: Icon,
  onSelect,
}: GuardrailTemplateCardProps) {
  const handleSelect = () => onSelect?.(templateKind);

  const content = (
    <span className="flex min-w-0 flex-1 items-center gap-3.5">
      <span
        aria-hidden="true"
        className="bg-surface-sunken text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg border"
      >
        <Icon size="lg" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-bold">{title}</span>
        <span className="text-muted-foreground truncate text-sm" title={hint}>
          {hint}
        </span>
      </span>
    </span>
  );

  if (onSelect === undefined) {
    return (
      <div className={cardVariants({ interactive: false })}>{content}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={cardVariants({ interactive: true })}
    >
      {content}
      <span className={`shrink-0 ${styles.action}`}>
        <span className="text-link flex items-center gap-0.5 pl-3.5 text-sm whitespace-nowrap">
          Configure
          <ChevronRight size="base" color="inherit" aria-hidden />
        </span>
      </span>
    </button>
  );
}
