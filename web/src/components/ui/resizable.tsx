/* eslint-disable @repo/no-style-props, @repo/component-file-structure */
"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/src/utils/tailwind";

function ResizablePanelGroup({
  className,
  orientation,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className,
      )}
      orientation={orientation}
      {...props}
    />
  );
}

/** `isolate` keeps z-indexes inside a panel (sticky table headers) below the handle. */
function ResizablePanel({
  className,
  ...props
}: ResizablePrimitive.PanelProps) {
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      className={cn("isolate", className)}
      {...props}
    />
  );
}

const resizableHandleVariants = cva(
  "group ring-offset-background focus-visible:ring-ring relative z-1 flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
  {
    variants: {
      variant: {
        /** The handle draws the divider line between the panels. */
        line: "bg-border",
        /** Invisible handle for panels that draw their own borders. */
        gap: "bg-transparent",
      },
    },
    defaultVariants: { variant: "line" },
  },
);

function ResizableHandle({
  withHandle,
  variant,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps &
  VariantProps<typeof resizableHandleVariants> & {
    /** `hover` shows the grip only while the handle is hovered, dragged or focused. */
    withHandle?: boolean | "hover";
  }) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(resizableHandleVariants({ variant }), className)}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "bg-border z-10 flex h-6 w-1 shrink-0 rounded-lg",
            withHandle === "hover" &&
              "opacity-0 transition-opacity group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100 group-data-[separator=hover]:opacity-100",
          )}
        />
      )}
    </ResizablePrimitive.Separator>
  );
}

const usePanelRef = ResizablePrimitive.usePanelRef;
const NOOP_LAYOUT_STORAGE = { getItem: () => null, setItem: () => {} };

function useDefaultLayout({
  storage,
  ...options
}: Pick<
  Parameters<typeof ResizablePrimitive.useDefaultLayout>[0],
  "debounceSaveMs" | "panelIds"
> & {
  id: string;
  storage: "local" | "session" | false;
}) {
  const browserStorage = (() => {
    if (!storage || typeof window === "undefined") return NOOP_LAYOUT_STORAGE;
    return storage === "local" ? localStorage : sessionStorage;
  })();
  return ResizablePrimitive.useDefaultLayout({
    ...options,
    storage: browserStorage,
  });
}

export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
  useDefaultLayout,
};
