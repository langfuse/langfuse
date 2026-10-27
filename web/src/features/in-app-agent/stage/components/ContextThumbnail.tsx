import { Layers } from "@langfuse/icons";

import { drawThumbnail } from "@/src/features/in-app-agent/stage/render/drawCaptureThumbnail";

/**
 * The picture half of the attachment. Draws once on mount at its laid-out
 * size; the canvas is never repainted, so there is no render loop to own.
 */
export function ContextThumbnail({
  source,
  label,
}: {
  source: HTMLCanvasElement | null;
  label: string;
}) {
  if (!source) {
    return (
      <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center">
        <Layers size="lg" color="muted" aria-hidden />
      </div>
    );
  }
  return (
    <canvas
      ref={(canvas) => {
        if (canvas) {
          drawThumbnail(canvas, source);
        }
      }}
      role="img"
      aria-label={label}
      className="block h-full w-full"
    />
  );
}
