type SpielwieseCanvasPaneProps = {
  bottomRadius: "none" | "top";
};

function SpielwieseCanvasPane({ bottomRadius }: SpielwieseCanvasPaneProps) {
  const radiusClassName =
    bottomRadius === "top"
      ? "rounded-t-lg rounded-b-none"
      : "rounded-none border-t-0";

  return (
    <div
      className={`bg-card flex min-h-0 flex-1 flex-col overflow-hidden border px-6 pt-6 pb-0 shadow-xs sm:px-10 sm:pt-8 ${radiusClassName}`}
      data-testid="spielwiese-editor-canvas-pane"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 pt-5 pb-0 sm:pt-6">
        <div
          aria-hidden="true"
          className="bg-foreground mt-1 h-6 w-px rounded-full"
        />
      </div>
    </div>
  );
}

export function SpielwieseCanvasPaneStack() {
  return (
    <>
      <SpielwieseCanvasPane bottomRadius="top" />
      <SpielwieseCanvasPane bottomRadius="none" />
    </>
  );
}
