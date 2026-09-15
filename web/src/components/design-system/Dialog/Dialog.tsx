/* eslint-disable boundaries/dependencies */
"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X, type LucideIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/src/components/ui/button";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { cn } from "@/src/utils/tailwind";

import motionStyles from "./Dialog.module.css";

const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] flex max-h-[85vh] w-full translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden bg-modal shadow-lg sm:rounded-lg",
  {
    variants: {
      size: {
        sm: "max-w-md",
        default: "max-w-lg",
        lg: "max-w-4xl",
        xxl: "h-[90vh] max-w-[95vw]",
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
  icon?: LucideIcon;
  label: string;
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  variant?: "default" | "destructive";
};

type DialogProps = {
  actions?: ReadonlyArray<DialogAction>;
  closeOnInteractionOutside?: boolean;
  size?: VariantProps<typeof dialogContentVariants>["size"];
  title: string;
} & (
  | { children?: React.ReactNode; text?: never }
  | { children?: never; text: string }
);

function DialogRoot({
  actions,
  children,
  closeOnInteractionOutside = false,
  size,
  text,
  title,
}: DialogProps) {
  const container = useLayerContainer("modal");
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
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

          cancelButtonRef.current?.focus();
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
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
        <header className="bg-modal sticky top-0 z-30 flex shrink-0 flex-col gap-1 rounded-t-lg p-4">
          <div className="flex w-full items-center justify-between gap-4 text-center sm:text-left">
            <DialogPrimitive.Title className="min-w-0 flex-1 text-lg leading-none font-bold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent z-20 -mt-2 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
              tabIndex={-1}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        </header>
        {text !== undefined ? <DialogBody>{text}</DialogBody> : children}
        {actions?.length ? (
          <DialogFooter>
            <DialogPrimitive.Close asChild>
              <Button ref={cancelButtonRef} variant="outline">
                Cancel
              </Button>
            </DialogPrimitive.Close>
            {actions.map(({ icon: Icon, label, ...buttonProps }, index) => (
              <Button
                key={label}
                ref={(button) => {
                  actionButtonRefs.current[index] = button;
                }}
                {...buttonProps}
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  {Icon ? (
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                </span>
              </Button>
            ))}
          </DialogFooter>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-modal sticky bottom-0 z-10 flex shrink-0 flex-col-reverse rounded-b-lg p-4 sm:flex-row sm:justify-end sm:space-x-2 [&>button]:w-full sm:[&>button]:w-auto">
      {children}
    </div>
  );
}

const Dialog = Object.assign(DialogRoot, { Body: DialogBody });

export { Dialog };
