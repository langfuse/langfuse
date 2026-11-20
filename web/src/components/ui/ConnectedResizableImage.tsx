import { type ComponentProps } from "react";
import { ConnectedSafeImageController } from "@/src/components/design-system/ConnectedSafeImageController/ConnectedSafeImageController";
import { SafeResizableImage } from "./SafeResizableImage";

export function ConnectedResizableImage({
  src,
  ...props
}: Pick<ComponentProps<typeof ConnectedSafeImageController>, "src"> &
  Pick<
    ComponentProps<typeof SafeResizableImage>,
    "alt" | "fitContent" | "compactWidth"
  >) {
  return (
    <ConnectedSafeImageController src={src}>
      {(state) => <SafeResizableImage {...props} state={state} />}
    </ConnectedSafeImageController>
  );
}
