/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, @repo/no-null-render, @repo/component-file-structure */
import { default as React, useState, useCallback, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SubHeader } from "@/src/components/layouts/header";
import { cn } from "@/src/utils/tailwind";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { Separator } from "@/src/components/ui/separator";
import useSessionStorage from "@/src/components/useSessionStorage";

const SidePanelContext = React.createContext<{
  showPanel: boolean;
  setShowPanel: (value: boolean) => void;
  isMobile: boolean;
  isControlled: boolean;
  variant: "default" | "sidebar";
  label: string;
} | null>(null);

/**
 * Side panel component with controlled/uncontrolled modes.
 *
 * **Uncontrolled mode** (default):
 * - Omit `openState` prop
 * - Panel state persisted in session storage
 * - User can toggle via chevron button
 * - Example: `<SidePanel id="details">{content}</SidePanel>`
 *
 * **Controlled mode**:
 * - Provide `openState` with `open` and `onOpenChange`
 * - No session storage, no toggle button
 * - Parent controls open/close state
 * - Example: `<SidePanel id="annotate" openState={{ open: isOpen, onOpenChange: setIsOpen }}>{content}</SidePanel>`
 */
const SidePanel = ({
  id,
  children,
  className,
  mobileTitle,
  scrollable = true,
  variant = "default",
  openState,
  mobileOpenState,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  mobileTitle?: string;
  scrollable?: boolean;
  variant?: "default" | "sidebar";
  /** Controlled mode: provide to control panel state externally */
  openState?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  /** Persist the mobile sheet state externally while retaining built-in toggles. */
  mobileOpenState?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
}) => {
  const isControlled = openState !== undefined;
  const controlledOpen = openState?.open;
  const onOpenChange = openState?.onOpenChange;
  const onMobileOpenChange = mobileOpenState?.onOpenChange;
  const [uncontrolledOpen, setUncontrolledOpen] = useSessionStorage<boolean>(
    `${id}-showPanel`,
    true,
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  const showPanel = isControlled ? (controlledOpen ?? false) : uncontrolledOpen;
  const collapsedWidth = variant === "sidebar" ? "w-10" : "w-fit";

  const setShowPanel = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value);
      } else {
        setUncontrolledOpen(value);
      }
    },
    [isControlled, onOpenChange, setUncontrolledOpen],
  );

  const handleMobileOpenChange = useCallback(
    (open: boolean) => {
      if (isControlled) {
        onOpenChange?.(open);
      } else if (onMobileOpenChange) {
        onMobileOpenChange(open);
      } else {
        setMobileSheetOpen(open);
      }
    },
    [isControlled, onOpenChange, onMobileOpenChange],
  );

  const contextValue = React.useMemo(
    () => ({
      showPanel,
      setShowPanel,
      isMobile,
      isControlled,
      variant,
      label: mobileTitle?.toLowerCase() ?? "details",
    }),
    [showPanel, setShowPanel, isMobile, isControlled, variant, mobileTitle],
  );

  if (isMobile) {
    return (
      <Sheet
        open={
          isControlled ? showPanel : (mobileOpenState?.open ?? mobileSheetOpen)
        }
        onOpenChange={handleMobileOpenChange}
      >
        {!isControlled && (
          <div className="border-l px-1 pt-2">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={
                  variant === "sidebar"
                    ? `Show ${mobileTitle?.toLowerCase() ?? "details"}`
                    : "Show details"
                }
              >
                {variant === "sidebar" ? (
                  <PanelRightOpen className="icon-base text-icon-foreground" />
                ) : (
                  <ChevronLeft className="icon-base text-icon-foreground" />
                )}
              </Button>
            </SheetTrigger>
          </div>
        )}
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>{mobileTitle}</SheetTitle>
          </SheetHeader>
          <div
            className={cn(
              "flex min-h-0 w-full flex-1 flex-col gap-2",
              scrollable ? "overflow-y-auto" : "overflow-hidden",
            )}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <SidePanelContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex h-full flex-row overflow-hidden border-l",
          showPanel ? "w-[25vw]" : collapsedWidth,
          variant === "sidebar" && "bg-surface",
          className,
        )}
      >
        <div className="grid h-full w-full items-start gap-2 overflow-hidden">
          <div
            className={cn(
              "flex h-full w-full flex-col",
              variant === "sidebar" ? "gap-0" : "gap-2",
              scrollable ? "overflow-y-auto" : "overflow-hidden",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </SidePanelContext.Provider>
  );
};

const SidePanelHeader = ({ children }: { children: ReactNode }) => {
  const context = React.useContext(SidePanelContext);

  if (!context) return null;

  const { showPanel, setShowPanel, isControlled, variant, label } = context;

  if (variant === "sidebar" && !isControlled) {
    const toggleLabel = `${showPanel ? "Hide" : "Show"} ${label}`;
    return (
      <div
        className={cn(
          "bg-surface flex h-10 shrink-0 items-center",
          showPanel ? "px-2" : "justify-center border-b",
        )}
      >
        <Tooltip label={toggleLabel}>
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps()}
              icon={showPanel ? PanelRightClose : PanelRightOpen}
              label={toggleLabel}
              size="sm"
              aria-expanded={showPanel}
              onClick={() => setShowPanel(!showPanel)}
            />
          )}
        </Tooltip>
        {showPanel && children}
      </div>
    );
  }

  if (isControlled) {
    if (!showPanel) return null;

    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center gap-1">{children}</div>
        <Separator />
      </div>
    );
  }

  if (!showPanel) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowPanel(true)}
        title="Show details"
      >
        <ChevronLeft className="icon-base text-icon-foreground" />
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-fit w-full flex-row items-center justify-between p-2 pb-0">
        <div className="flex flex-row items-center gap-1">{children}</div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowPanel(false)}
          title="Hide details"
        >
          <ChevronRight className="icon-base text-icon-foreground" />
        </Button>
      </div>
      <Separator />
    </div>
  );
};

const SidePanelTitle = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <SubHeader title={children?.toString() ?? ""} className={className} />;

const SidePanelContent = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const context = React.useContext(SidePanelContext);
  if (!context) return children;

  const { showPanel } = context;
  if (!showPanel) return null;

  return (
    <div className={cn("flex flex-col items-start gap-4", className)}>
      {children}
    </div>
  );
};

export { SidePanel, SidePanelHeader, SidePanelTitle, SidePanelContent };
