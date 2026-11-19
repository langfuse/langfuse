import { useState } from "react";
import { Maximize2, Minimize2 } from "@langfuse/icons";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";
import {
  SafeImageController,
  type SafeImageState,
} from "@/src/components/design-system/SafeImageController/SafeImageController";
import { cn } from "@/src/utils/tailwind";
import { Button } from "./button";

export const COMPACT_IMAGE_MAX_HEIGHT_REM = 16;

export function SafeResizableImage({
  src,
  state,
  alt = "Markdown image",
  fitContent = false,
  compactWidth,
}: {
  alt?: string;
  fitContent?: boolean;
  compactWidth?: string;
} & ({ src: string; state?: never } | { state: SafeImageState; src?: never })) {
  const [isZoomedIn, setIsZoomedIn] = useState(true);

  if (state === undefined) {
    return (
      <SafeImageController src={src}>
        {(state) => (
          <SafeResizableImage
            state={state}
            alt={alt}
            fitContent={fitContent}
            compactWidth={compactWidth}
          />
        )}
      </SafeImageController>
    );
  }

  if (state.status !== "ready") {
    return <SafeImage state={state} alt={alt} />;
  }
  const { Image, imageProps } = state;

  return (
    <div
      className={cn(fitContent && (isZoomedIn ? "w-1/2" : "w-full"))}
      style={
        fitContent && isZoomedIn && compactWidth
          ? { width: `min(50%, ${compactWidth})` }
          : undefined
      }
    >
      <div
        className={cn(
          "group relative overflow-hidden",
          fitContent && "w-full",
          !fitContent && isZoomedIn && "w-fit max-w-full min-w-10",
          !fitContent && !isZoomedIn && "h-full w-full",
        )}
      >
        <Image
          {...imageProps}
          alt={alt}
          loading="lazy"
          className={cn(
            "rounded border",
            fitContent && "h-auto w-full",
            !fitContent && isZoomedIn && "h-auto max-h-52 w-auto max-w-full",
            !fitContent && !isZoomedIn && "h-full w-full object-contain",
          )}
        />
        <Button
          type="button"
          title={isZoomedIn ? "Expand image" : "Shrink image"}
          className="group-hover:bg-accent/30! absolute top-0 right-0 mt-1 mr-1 h-8 w-8 opacity-0 group-hover:opacity-100"
          variant="ghost"
          size="icon"
          onClick={() => setIsZoomedIn(!isZoomedIn)}
        >
          {isZoomedIn ? (
            <Maximize2 size="base" color="default" />
          ) : (
            <Minimize2 size="base" color="default" />
          )}
        </Button>
      </div>
    </div>
  );
}
