"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/components/ui/layer";
import motionStyles from "./dialog-motion.module.css";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

// Route the portal into the `modal` overlay layer (null until mounted →
// falls back to <body>, SSR-parity). Layer order, not z-index, stacks it.
const DialogPortal = ({
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>) => {
  const container = useLayerContainer("modal");
  return <DialogPrimitive.Portal container={container} {...props} />;
};
DialogPortal.displayName = "DialogPortal";

const DialogClose = DialogPrimitive.Close;

type DialogOverlayMode = "subtle" | "invisible" | "blocking";

const dialogOverlayClasses: Record<DialogOverlayMode, string> = {
  invisible: "bg-transparent",
  subtle: "bg-black/25 dark:bg-black/45",
  blocking: "bg-black/50 dark:bg-black/65",
};

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
    overlayMode?: DialogOverlayMode;
  }
>(({ className, overlayMode = "subtle", ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      motionStyles.overlay,
      "fixed inset-0",
      dialogOverlayClasses[overlayMode],
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] overflow-hidden flex w-full translate-x-[-50%] translate-y-[-50%] flex-col bg-background shadow-lg sm:rounded-lg",
  {
    variants: {
      size: {
        default: "max-w-lg max-h-[85vh]",
        lg: "max-w-4xl max-h-[85vh]",
        xl: "max-w-7xl h-[90vh]",
        xxl: "max-w-[95vw] h-[90vh]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeOnInteractionOutside?: boolean;
    confirmCloseOnEscape?: string;
    overlayMode?: DialogOverlayMode;
    stopPropagationOnEnterSpace?: boolean;
  } & VariantProps<typeof dialogContentVariants>
>(
  (
    {
      className,
      children,
      closeOnInteractionOutside = false,
      confirmCloseOnEscape,
      overlayMode = "subtle",
      stopPropagationOnEnterSpace = true,
      onEscapeKeyDown,
      size,
      ...props
    },
    ref,
  ) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Prevent Enter/Space key events from propagating to parent elements
      // This prevents triggering actions like row clicks when submitting forms in dialogs
      if (stopPropagationOnEnterSpace && (e.key === "Enter" || e.key === " ")) {
        e.stopPropagation();
      }
    };
    const handleEscapeKeyDown: React.ComponentPropsWithoutRef<
      typeof DialogPrimitive.Content
    >["onEscapeKeyDown"] = (e) => {
      onEscapeKeyDown?.(e);

      if (e.defaultPrevented || !confirmCloseOnEscape) {
        return;
      }

      if (!window.confirm(confirmCloseOnEscape)) {
        e.preventDefault();
      }
    };

    return (
      <DialogPortal>
        <DialogOverlay overlayMode={overlayMode} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            motionStyles.content,
            dialogContentVariants({ size, className }),
          )}
          aria-describedby={undefined}
          onKeyDown={handleKeyDown}
          onEscapeKeyDown={handleEscapeKeyDown}
          onPointerDownOutside={(e) => {
            if (!closeOnInteractionOutside) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (!closeOnInteractionOutside) {
              e.preventDefault();
            }
          }}
          {...props}
        >
          {children}
          <div className="[&:has(.dialog-header)]:hidden [&:not(:has(.dialog-header))]:absolute [&:not(:has(.dialog-header))]:top-3 [&:not(:has(.dialog-header))]:right-3 [&:not(:has(.dialog-header))]:z-20">
            <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dialog-header bg-background sticky top-0 z-30 flex shrink-0 flex-col space-y-1.5 rounded-t-lg border-b p-4",
      className,
    )}
    {...props}
  >
    <div className="flex w-full items-center justify-between gap-4 text-center sm:text-left">
      <div className="min-w-0 flex-1">{children}</div>
      <DialogPrimitive.Close
        className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-20 mt-1 ml-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
        tabIndex={-1}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </div>
  </div>
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-1 flex-col gap-4 overflow-y-auto p-4", className)}
    {...props}
  />
));
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dialog-footer bg-background sticky bottom-0 z-10 flex shrink-0 flex-col-reverse rounded-b-lg border-t p-6 px-6 sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl leading-none font-semibold tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground mt-1 text-sm", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
