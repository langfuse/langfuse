import { useState, type ReactNode } from "react";
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
} | null>(null);

const SidePanel = ({
  id,
  children,
  className,
  mobileTitle,
  scrollable = true,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  mobileTitle?: string;
  scrollable?: boolean;
}) => {
  const [showPanel, setShowPanel] = useSessionStorage<boolean>(
    `${id}-showPanel`,
    true,
  );
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const contextValue = React.useMemo(
    () => ({
      showPanel,
      setShowPanel,
      isMobile,
    }),
    [showPanel, setShowPanel, isMobile],
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <div className="border-l px-1 pt-2">
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </SheetTrigger>
        </div>
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
              showPanel ? "p-2" : "p-1 pr-2 pt-2",
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

  // Don't throw if we're in mobile mode (no context)
  if (!context) return null;

  const { showPanel, setShowPanel } = context;

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
      <div className="flex h-fit w-full flex-row items-center justify-between gap-2">
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
