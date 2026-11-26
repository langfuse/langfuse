import { type ReactNode, useId } from "react";
import { type IconComponent } from "@langfuse/icons";

import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { cn } from "@/src/utils/tailwind";

function GatewayPlaceholderFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 py-6"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 id={titleId} className="text-3xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="text-foreground-secondary max-w-lg text-base">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function GatewayPlaceholderActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {children}
    </div>
  );
}

/** A dotted panel holding a diagram; `children` sets the diagram's size. */
function GatewayPlaceholderDiagram({ children }: { children: ReactNode }) {
  return (
    <div className={cn("w-full rounded-xl px-6 py-5", diagramStyles.panel)}>
      {children}
    </div>
  );
}

function GatewayPlaceholderBenefits({ children }: { children: ReactNode }) {
  return (
    <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">{children}</ul>
  );
}

function GatewayPlaceholderBenefit({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border px-4 py-3">
      <span className="flex h-5 shrink-0 items-center">
        <Icon size="base" color="muted" aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </li>
  );
}

/** Building blocks of the full-page AI Gateway placeholders. */
export const GatewayPlaceholder = {
  Frame: GatewayPlaceholderFrame,
  Actions: GatewayPlaceholderActions,
  Diagram: GatewayPlaceholderDiagram,
  Benefits: GatewayPlaceholderBenefits,
  Benefit: GatewayPlaceholderBenefit,
};
