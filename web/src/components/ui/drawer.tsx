"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/src/utils/tailwind";
import { useMediaQuery } from "react-responsive";
import { cva } from "class-variance-authority";

type DrawerProps = React.ComponentProps<typeof DrawerPrimitive.Root> & {
  forceDirection?: "right" | "bottom" | "responsive";
  /**
   * Whether to block text selection in the drawer.
   * Set to false to allow text selection (e.g., in comment sections).
   * @default false
   */
  blockTextSelection?: boolean;
};

type DrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> & {
  overlayClassName?: string;
  size?: "default" | "md" | "lg" | "full";
  position?: "top";
  height?: "default" | "md";
  blockTextSelection?: boolean;
};

// https://tailwindcss.com/docs/responsive-design
const TAILWIND_MD_MEDIA_QUERY = 768;

const drawerVariants = cva(
  "fixed inset-x-0 z-50 flex h-auto flex-col rounded-t-lg border bg-background md:inset-x-auto md:right-0 md:mt-0 md:rounded-l-lg md:rounded-r-none ",
  {
    variants: {
      size: {
        default: "md:w-1/2 lg:w-2/5 xl:w-1/3 2xl:w-1/4",
        md: "w-3/5",
        lg: "w-2/3",
        full: "w-full",
      },
      position: {
        top: "md:bottom-0 md:top-banner-offset md:max-h-screen-with-banner",
      },
      height: {
        default: "h-1/3 md:h-full",
        md: "md:h-1/2",
      },
    },
    defaultVariants: {
      size: "default",
      position: "top",
      height: "default",
    },
  },
);

const DrawerContext = React.createContext<{
  blockTextSelection: boolean;
}>({
  blockTextSelection: false,
});

const useDrawerContext = () => React.useContext(DrawerContext);

const Drawer = ({
  shouldScaleBackground = true,
  forceDirection = "responsive",
  blockTextSelection = false,
  ...props
}: DrawerProps) => {
  const isMediumScreen = useMediaQuery({
    query: `(min-width: ${TAILWIND_MD_MEDIA_QUERY}px)`,
  });
  const direction =
    forceDirection === "responsive"
      ? isMediumScreen
        ? "right"
        : "bottom"
      : forceDirection;

  return (
    <DrawerContext.Provider value={{ blockTextSelection }}>
      <DrawerPrimitive.Root
        shouldScaleBackground={shouldScaleBackground}
        direction={direction}
        {...props}
      />
    </DrawerContext.Provider>
  );
};
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-primary/20", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  DrawerContentProps
>(
  (
    { className, children, overlayClassName, size, height, position, ...props },
    ref,
  ) => {
    const { blockTextSelection } = useDrawerContext();

    return (
      <DrawerPortal>
        <DrawerOverlay className={overlayClassName} />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(drawerVariants({ size, className, height, position }))}
          data-allow-text-selection={!blockTextSelection}
          {...props}
        >
          <DrawerDescription className="sr-only">
            {props.title ?? ""}
          </DrawerDescription>
          {children}
        </DrawerPrimitive.Content>
      </DrawerPortal>
    );
  },
);
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
