import { ArrowRight, BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import type { InAppAgentContextualLanding as InAppAgentContextualLandingConfig } from "@/src/features/in-app-agent/lib/contextualLanding";

export function InAppAgentContextualLanding({
  landing,
  isDisabled,
  onSelectExample,
}: {
  landing: Pick<
    InAppAgentContextualLandingConfig,
    "title" | "description" | "examples"
  >;
  isDisabled: boolean;
  onSelectExample: (
    example: InAppAgentContextualLandingConfig["examples"][number],
  ) => void;
}) {
  return (
    <>
      <BotMessageSquare className="text-muted-foreground icon-xl mx-auto" />
      <p className="text-foreground mt-3 text-center text-sm font-bold">
        {landing.title}
      </p>
      <p className="text-muted-foreground mt-1 max-w-sm text-center text-xs leading-relaxed">
        {landing.description}
      </p>
      <div className="mt-4 grid w-full max-w-sm grid-cols-1 gap-2">
        {landing.examples.map((example) => (
          <Button
            key={example.id}
            type="button"
            variant="outline"
            className="bg-card hover:bg-muted/60 group h-auto min-h-13 w-full justify-start gap-2 rounded-md px-3 py-2 text-left whitespace-normal shadow-xs"
            disabled={isDisabled}
            onClick={() => {
              onSelectExample(example);
            }}
          >
            <span className="text-foreground min-w-0 flex-1 text-xs leading-snug font-medium">
              {example.label}
            </span>
            <ArrowRight
              aria-hidden="true"
              className="icon-base text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </Button>
        ))}
      </div>
    </>
  );
}
