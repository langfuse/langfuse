import { useState, useCallback, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SubHeader } from "@/src/components/layouts/header";
import { cn } from "@/src/utils/tailwind";
import React from "react";
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
  openState,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  mobileTitle?: string;
  scrollable?: boolean;
  /** Controlled mode: provide to control panel state externally */
  openState?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
}) => {
  const isControlled = openState !== undefined;
  const controlledOpen = openState?.open;
  const onOpenChange = openState?.onOpenChange;
  const [uncontrolledOpen, setUncontrolledOpen] = useSessionStorage<boolean>(
    `${id}-showPanel`,
    true,
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  const showPanel = isControlled ? (controlledOpen ?? false) : uncontrolledOpen;

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
      } else {
        setMobileSheetOpen(open);
      }
    },
    [isControlled, onOpenChange],
  );

  const contextValue = React.useMemo(
    () => ({
      showPanel,
      setShowPanel,
      isMobile,
      isControlled,
    }),
    [showPanel, setShowPanel, isMobile, isControlled],
  );

  if (isMobile) {
    return (
      <Sheet
        open={isControlled ? showPanel : mobileSheetOpen}
        onOpenChange={handleMobileOpenChange}
      >
        {!isControlled && (
          <div className="border-l px-1 pt-2">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </SheetTrigger>
          </div>
        )}
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{mobileTitle}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 flex h-full w-full flex-col gap-2">
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
          showPanel ? "w-[25vw]" : "w-fit",
          className,
        )}
      >
        <div className="grid h-full w-full items-start gap-2 overflow-hidden">
          <div
            className={cn(
              "flex h-full w-full flex-col gap-2",
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

  const { showPanel, setShowPanel, isControlled } = context;

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
        <ChevronLeft className="h-4 w-4" />
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
          <ChevronRight className="h-4 w-4" />
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
