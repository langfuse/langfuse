import { Separator } from "../ui/separator";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type SpielwiesePromptCanvasProps = {
  promptCanvas: NonNullable<SpielwieseDashboardVM["promptCanvas"]>;
};

function PromptSection({
  content,
  label,
}: NonNullable<SpielwieseDashboardVM["promptCanvas"]>["sections"][number]) {
  return (
    <section className="bg-background flex flex-col gap-3 rounded-lg border px-4 py-4">
      <p className="text-muted-foreground text-sm font-medium tracking-[0.12em] uppercase">
        {label}
      </p>
      <div className="flex flex-col gap-2">
        {content.map((line) => (
          <p
            key={line}
            className="text-foreground text-base text-pretty sm:text-sm"
          >
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}

export function SpielwiesePromptCanvas({
  promptCanvas,
}: SpielwiesePromptCanvasProps) {
  return (
    <section
      className="bg-card @container flex min-h-[calc(100dvh-7rem)] flex-col rounded-lg border px-6 py-6 shadow-xs sm:px-10 sm:py-8"
      data-testid="spielwiese-prompt-canvas"
    >
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-balance sm:text-4xl">
          {promptCanvas.title}
        </h1>
        <Separator />
      </div>

      <div className="flex flex-1 flex-col gap-4 py-5 sm:py-6">
        {promptCanvas.sections.map((section) => (
          <PromptSection
            content={section.content}
            key={section.id}
            label={section.label}
          />
        ))}
      </div>
    </section>
  );
}
