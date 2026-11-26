import { type ReactNode, useId } from "react";

import { NoGuardrailsDiagram } from "./NoGuardrailsDiagram";

export type NoGuardrailsFrameProps = {
  description: string;
  actions: ReactNode;
  children: ReactNode;
};

export function NoGuardrailsFrame({
  description,
  actions,
  children,
}: NoGuardrailsFrameProps) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="@container mx-auto flex w-full max-w-5xl flex-col gap-14 py-6"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 id={titleId} className="text-3xl font-bold tracking-tight">
            No guardrails yet
          </h2>
          <p className="text-foreground-secondary max-w-lg text-base">
            {description}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {actions}
          </div>
        </div>
        <NoGuardrailsDiagram />
      </div>
      {children}
    </section>
  );
}
