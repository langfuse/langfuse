"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] overflow-hidden z-50 flex w-full flex-col translate-x-[-50%] translate-y-[-50%] bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
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
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeOnInteractionOutside?: boolean;
    stopPropagationOnEnterSpace?: boolean;
  } & VariantProps<typeof dialogContentVariants>
>(
  (
    {
      className,
      children,
      closeOnInteractionOutside = false,
      stopPropagationOnEnterSpace = true,
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

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogContentVariants({ size, className }))}
          aria-describedby={undefined}
          onKeyDown={handleKeyDown}
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
          <div className="[&:has(.dialog-header)]:hidden [&:not(:has(.dialog-header))]:absolute [&:not(:has(.dialog-header))]:right-3 [&:not(:has(.dialog-header))]:top-3 [&:not(:has(.dialog-header))]:z-20">
            <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
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
      "dialog-header sticky top-0 z-30 flex flex-shrink-0 flex-col space-y-1.5 rounded-t-lg border-b bg-background p-4",
      className,
    )}
    {...props}
  >
    <div className="flex w-full items-center justify-between gap-4 text-center sm:text-left">
      <div className="min-w-0 flex-1">{children}</div>
      <DialogPrimitive.Close
        className="z-20 ml-4 mt-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
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
      "dialog-footer sticky bottom-0 z-10 flex flex-shrink-0 flex-col-reverse rounded-b-lg border-t bg-background p-6 px-6 sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-sm text-muted-foreground", className)}
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
