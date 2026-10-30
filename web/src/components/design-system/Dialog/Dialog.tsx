"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X, type IconComponent } from "@langfuse/icons";
import * as React from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { cn } from "@/src/utils/tailwind";

import motionStyles from "./Dialog.module.css";

const dialogContentVariants = cva(
  "fixed top-0 left-0 flex h-dvh w-full flex-col bg-modal shadow-lg sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[85vh] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
  {
    variants: {
      size: {
        sm: "sm:max-w-md",
        default: "sm:max-w-lg",
        md: "sm:max-w-2xl",
        lg: "sm:max-w-4xl",
        xxl: "sm:h-[90vh] sm:max-w-[95vw]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type DialogAction = {
  disabled?: boolean;
  form?: string;
  icon?: IconComponent;
  label: string;
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  variant?: "default" | "destructive";
};

type DialogProps = {
  /** Defaults to "Cancel". Without `actions`, the close button is the only, primary button. */
  closeLabel?: string;
  closeOnInteractionOutside?: boolean;
  /** Disable when a child interaction handles activation keys on the document. */
  stopPropagationOnEnterSpace?: boolean;
  size?: VariantProps<typeof dialogContentVariants>["size"];
  title: string;
} & (
  | { children?: React.ReactNode; text?: never }
  | { children?: never; text: string }
) & {
    /** Decision footer: the close button is added before these actions. */
    actions?: ReadonlyArray<DialogAction>;
  };

function DialogRoot({
  actions,
  children,
  closeLabel,
  closeOnInteractionOutside = false,
  stopPropagationOnEnterSpace = true,
  size,
  text,
  title,
}: DialogProps) {
  const container = useLayerContainer("modal");
  const [popoverContainer, setPopoverContainer] =
    React.useState<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  // Radix auto-focuses only on open; a dialog that swaps to a close-only
  // footer while open (e.g. after a submit) would otherwise drop focus to the
  // document body.
  const attachCloseOnlyButton = React.useCallback(
    (button: HTMLButtonElement | null) => {
      closeButtonRef.current = button;
      button?.focus();
    },
    [],
  );
  const hasActions = Boolean(actions?.length);
  const isCloseOnly = !hasActions && closeLabel !== undefined;
  const actionButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay
        className={cn(
          motionStyles.overlay,
          "fixed inset-0 bg-black/25 dark:bg-black/45",
        )}
        onClick={(event) => event.stopPropagation()}
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(motionStyles.content, dialogContentVariants({ size }))}
        onOpenAutoFocus={(event) => {
          // Radix otherwise focuses Cancel because it is the first tabbable.
          // Prefer the rightmost safe action, falling back to Cancel rather
          // than immediately triggering a destructive action.
          if (isCloseOnly) {
            event.preventDefault();
            closeButtonRef.current?.focus();
            return;
          }

          if (text === undefined) return;

          let safeActionButton: HTMLButtonElement | null = null;
          for (let index = (actions?.length ?? 0) - 1; index >= 0; index--) {
            const action = actions?.[index];
            const button = actionButtonRefs.current[index];
            if (
              action?.variant !== "destructive" &&
              button &&
              !button.disabled
            ) {
              safeActionButton = button;
              break;
            }
          }

          event.preventDefault();
          if (safeActionButton) {
            safeActionButton.focus();
            return;
          }

          closeButtonRef.current?.focus();
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (
            stopPropagationOnEnterSpace &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.stopPropagation();
          }
        }}
        onPointerDownOutside={(event) => {
          if (!closeOnInteractionOutside) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (!closeOnInteractionOutside) event.preventDefault();
        }}
      >
        <div className="isolate flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="bg-modal flex shrink-0 flex-col gap-1 rounded-t-lg p-4">
            <div className="flex w-full items-center justify-between gap-4 text-left">
              <DialogPrimitive.Title className="min-w-0 flex-1 text-lg leading-none font-bold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent z-20 -mt-2 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
                tabIndex={-1}
              >
                <X size="base" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </header>
          <PopoverLayerProvider container={popoverContainer}>
            {text !== undefined ? <DialogBody>{text}</DialogBody> : children}
          </PopoverLayerProvider>
          {hasActions || isCloseOnly ? (
            <DialogFooter>
              <DialogPrimitive.Close asChild>
                {isCloseOnly ? (
                  <Button
                    ref={attachCloseOnlyButton}
                    variant="primary"
                    text={closeLabel}
                  />
                ) : (
                  <Button
                    ref={closeButtonRef}
                    variant="secondary"
                    text={closeLabel ?? "Cancel"}
                  />
                )}
              </DialogPrimitive.Close>
              {actions?.map(
                ({ icon: Icon, label, variant, ...buttonProps }, index) => (
                  <Button
                    key={label}
                    icon={Icon}
                    ref={(button) => {
                      actionButtonRefs.current[index] = button;
                    }}
                    text={label}
                    {...buttonProps}
                    variant={
                      variant === "destructive" ? "destructive" : "primary"
                    }
                  />
                ),
              )}
            </DialogFooter>
          ) : null}
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

function DialogBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-modal flex shrink-0 flex-col-reverse rounded-b-lg p-4 sm:flex-row sm:justify-end sm:space-x-2 [&>button]:w-full sm:[&>button]:w-auto">
      {children}
    </div>
  );
}

const Dialog = Object.assign(DialogRoot, { Body: DialogBody });

export { Dialog };
