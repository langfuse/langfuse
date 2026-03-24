"use client";

import * as React from "react";
import { useMediaQuery } from "react-responsive";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { ResizableDesktopLayout } from "./ResizableDesktopLayout";

// --- Toggle Button ---

interface OverviewPanelToggleProps extends React.ComponentPropsWithoutRef<
  typeof Button
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OverviewPanelToggle = React.forwardRef<
  React.ElementRef<typeof Button>,
  OverviewPanelToggleProps
>(({ open, onOpenChange, className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="outline"
    size="icon"
    onClick={() => onOpenChange(!open)}
    title={open ? "Hide details" : "Show details"}
    className={className}
    {...props}
  >
    {open ? (
      <PanelRightClose className="h-4 w-4" />
    ) : (
      <PanelRightOpen className="h-4 w-4" />
    )}
  </Button>
));
OverviewPanelToggle.displayName = "OverviewPanelToggle";

// --- Layout ---

interface OverviewPanelLayoutProps {
  open: boolean;
  mainContent: React.ReactNode;
  overviewContent: React.ReactNode;
  persistId?: string;
  defaultMainSize?: number;
  defaultSidebarSize?: number;
  minMainSize?: number;
  maxSidebarSize?: number;
  sidebarPosition?: "left" | "right";
  className?: string;
}

/**
 * A responsive layout component that displays main content alongside an overview panel.
 *
 * - On desktop: Uses ResizableDesktopLayout with a collapsible sidebar
 * - On mobile: Stacks the overview panel above the main content
 *
 * The open/close state is controlled externally via the `open` prop.
 * Use `useSessionStorage` in the parent to persist the state.
 */
function OverviewPanelLayout({
  open,
  mainContent,
  overviewContent,
  persistId,
  defaultMainSize = 75,
  defaultSidebarSize = 25,
  minMainSize = 50,
  maxSidebarSize = 40,
  sidebarPosition = "right",
  className,
}: OverviewPanelLayoutProps) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // Mobile: stacked layout
  if (!isDesktop) {
    return (
      <div className={cn("flex h-full flex-col overflow-hidden", className)}>
        {open && (
          <div className="overflow-y-auto border-b p-4">{overviewContent}</div>
        )}
        <div className="flex-1 overflow-hidden">{mainContent}</div>
      </div>
    );
  }

  // Desktop: resizable layout
  return (
    <ResizableDesktopLayout
      className={className}
      mainContent={mainContent}
      sidebarContent={
        <div className="flex h-full flex-col overflow-y-auto p-4">
          {overviewContent}
        </div>
      }
      open={open}
      defaultMainSize={defaultMainSize}
      defaultSidebarSize={defaultSidebarSize}
      minMainSize={minMainSize}
      maxSidebarSize={maxSidebarSize}
      sidebarPosition={sidebarPosition}
      persistId={persistId}
    />
  );
}
OverviewPanelLayout.displayName = "OverviewPanelLayout";

// --- Panel Container ---

const OverviewPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-4", className)} {...props} />
));
OverviewPanel.displayName = "OverviewPanel";

// --- Header ---

interface OverviewPanelHeaderProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

const OverviewPanelHeader = React.forwardRef<
  HTMLDivElement,
  OverviewPanelHeaderProps
>(({ title, subtitle, actions, className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-start justify-between gap-2", className)}
    {...props}
  >
    <div>
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
));
OverviewPanelHeader.displayName = "OverviewPanelHeader";

// --- Content ---

const OverviewPanelContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-3 text-sm", className)} {...props} />
));
OverviewPanelContent.displayName = "OverviewPanelContent";

// --- Footer ---

const OverviewPanelFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("border-t pt-4", className)} {...props} />
));
OverviewPanelFooter.displayName = "OverviewPanelFooter";

// --- Field (for label-value pairs) ---

interface OverviewPanelFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
}

const OverviewPanelField = React.forwardRef<
  HTMLDivElement,
  OverviewPanelFieldProps
>(({ label, value, className, ...props }, ref) => (
  <div ref={ref} className={className} {...props}>
    <div className="text-muted-foreground text-xs">{label}</div>
    <div className="break-words">{value}</div>
  </div>
));
OverviewPanelField.displayName = "OverviewPanelField";

// --- Section (for grouping fields) ---

interface OverviewPanelSectionProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  title?: React.ReactNode;
}

const OverviewPanelSection = React.forwardRef<
  HTMLDivElement,
  OverviewPanelSectionProps
>(({ title, className, children, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-3", className)} {...props}>
    {title && (
      <h4 className="text-muted-foreground text-sm font-medium">{title}</h4>
    )}
    {children}
  </div>
));
OverviewPanelSection.displayName = "OverviewPanelSection";

export {
  OverviewPanelToggle,
  OverviewPanelLayout,
  OverviewPanel,
  OverviewPanelHeader,
  OverviewPanelContent,
  OverviewPanelFooter,
  OverviewPanelField,
  OverviewPanelSection,
};
