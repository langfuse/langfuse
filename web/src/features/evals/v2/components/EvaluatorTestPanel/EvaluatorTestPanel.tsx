import type { ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";

export function EvaluatorTestPanel({
  open,
  onOpenChange,
  sampleSelector,
  testSection,
  scopeControl,
  pinTestSection = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleSelector: ReactNode;
  testSection: ReactNode;
  scopeControl?: ReactNode;
  pinTestSection?: boolean;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-6">
        {open ? (
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="font-bold">Test with</h2>
            {scopeControl}
          </div>
        ) : null}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {sampleSelector}
          </div>
          <div className="shrink-0 border-t">{testSection}</div>
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
