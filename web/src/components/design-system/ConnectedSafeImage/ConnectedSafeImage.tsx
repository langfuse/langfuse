"use client";

import { type ComponentProps } from "react";
import { ConnectedSafeImageController } from "@/src/components/design-system/ConnectedSafeImageController/ConnectedSafeImageController";
import { SafeImage } from "@/src/components/design-system/SafeImage/SafeImage";

export function ConnectedSafeImage({
  src,
  ...props
}: Pick<ComponentProps<typeof ConnectedSafeImageController>, "src"> &
  Omit<ComponentProps<typeof SafeImage>, "src" | "state">) {
  return (
    <ConnectedSafeImageController src={src}>
      {(state) => <SafeImage {...props} state={state} />}
    </ConnectedSafeImageController>
  );
}
