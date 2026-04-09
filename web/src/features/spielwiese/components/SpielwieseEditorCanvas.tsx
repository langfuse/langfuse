import type { SpielwieseDashboardVM } from "../types/dashboard";

type SpielwieseEditorCanvasProps = {
  canvas: SpielwieseDashboardVM["canvas"];
};

export function SpielwieseEditorCanvas({
  canvas,
}: SpielwieseEditorCanvasProps) {
  return (
    <section
      className="bg-card @container flex min-h-[calc(100dvh-7rem)] flex-col rounded-lg border px-6 py-6 shadow-xs sm:px-10 sm:py-8"
      data-testid="spielwiese-editor-canvas"
    >
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-balance sm:text-4xl">
          {canvas.title}
        </h1>
        <div className="bg-border h-px" />
      </div>

      <div className="flex min-h-[28rem] flex-1 flex-col gap-6 py-5 sm:py-6">
        <div
          aria-hidden="true"
          className="bg-foreground mt-1 h-6 w-px rounded-full"
        />

        <div className="mt-auto flex flex-col gap-5 border-t border-transparent pt-4 @4xl:flex-row @4xl:items-end @4xl:justify-between">
          <p className="text-muted-foreground max-w-xl text-base text-pretty">
            {canvas.helper}
          </p>

          <dl className="grid gap-3 @md:grid-cols-3">
            {canvas.stats.map((stat) => (
              <div
                key={stat.id}
                className="bg-background flex min-w-[8rem] flex-col gap-1 rounded-lg border px-4 py-3"
              >
                <dt className="text-muted-foreground truncate text-sm">
                  {stat.label}
                </dt>
                <dd className="text-foreground text-lg font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
