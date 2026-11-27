import type { ReactNode } from "react";
import { FlaskConical, PanelRightClose, PanelRightOpen } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorTestPanel({
  open,
  onOpenChange,
  sampleSelector,
  testSection,
  heading,
  pinTestSection = false,
  testSectionResized = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleSelector: ReactNode;
  testSection: ReactNode;
  /** Replaces the default title, e.g. with a sample scope switcher. */
  heading?: ReactNode;
  /** Lets the sample fill the panel and keeps the test row at the bottom. */
  pinTestSection?: boolean;
  /** Raises the pinned test row's height cap once the user made it taller. */
  testSectionResized?: boolean;
}) {
  const title = heading ?? (
    <div className="flex items-center gap-2">
      <FlaskConical size="base" />
      <h2 className="font-bold">Test with sample observations</h2>
    </div>
  );

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        heading && "bg-surface-section",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2",
          heading ? "px-4 pt-3 pb-2" : "h-12 border-b px-6",
        )}
      >
        {open ? title : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={open ? "Collapse test panel" : "Expand test panel"}
          title={open ? "Collapse test panel" : "Expand test panel"}
          onClick={() => onOpenChange(!open)}
        >
          {open ? (
            <PanelRightClose size="base" color="default" />
          ) : (
            <PanelRightOpen size="base" color="default" />
          )}
        </Button>
      </div>
      {open && pinTestSection ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
            {sampleSelector}
          </div>
          <div
            className={cn(
              "flex min-h-0 shrink-0 flex-col border-t",
              testSectionResized ? "max-h-3/5" : "max-h-1/2",
            )}
          >
            {testSection}
          </div>
        </>
      ) : null}
      {open && !pinTestSection ? (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          {sampleSelector}
          {testSection}
        </div>
      ) : null}
    </aside>
  );
}
