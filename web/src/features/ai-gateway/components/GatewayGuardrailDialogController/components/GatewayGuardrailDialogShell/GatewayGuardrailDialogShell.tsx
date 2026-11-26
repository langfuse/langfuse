import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { cn } from "@/src/utils/tailwind";

type GatewayGuardrailDialogShellProps = {
  size: "xl" | "4xl";
  closeOnInteractionOutside?: boolean;
  noCapture?: boolean;
  children: ReactNode;
};

/**
 * Persistent Radix dialog frame shared by the guardrail template picker and
 * configuration form so step transitions stay in place without remounting the
 * overlay or replaying modal open animations.
 */
export function GatewayGuardrailDialogShell({
  size,
  closeOnInteractionOutside = false,
  noCapture = false,
  children,
}: GatewayGuardrailDialogShellProps) {
  const container = useLayerContainer("modal");
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);

  const handleStopClickPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  };

  const handlePreventOutsideClose = (event: { preventDefault: () => void }) => {
    if (!closeOnInteractionOutside) {
      event.preventDefault();
    }
  };

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay
        className="fixed inset-0 bg-black/25 dark:bg-black/45"
        onClick={handleStopClickPropagation}
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "bg-modal fixed top-0 left-0 flex h-dvh w-full flex-col shadow-lg sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[85vh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
          size === "xl" ? "sm:max-w-xl" : "sm:max-w-4xl",
          noCapture && "ph-no-capture",
        )}
        onClick={handleStopClickPropagation}
        onKeyDown={handleKeyDown}
        onPointerDownOutside={handlePreventOutsideClose}
        onInteractOutside={handlePreventOutsideClose}
      >
        <div className="isolate flex min-h-0 flex-1 flex-col overflow-hidden">
          <PopoverLayerProvider container={popoverContainer}>
            {children}
          </PopoverLayerProvider>
        </div>
        <div
          className="isolate"
          data-layer="popover"
          ref={setPopoverContainer}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
