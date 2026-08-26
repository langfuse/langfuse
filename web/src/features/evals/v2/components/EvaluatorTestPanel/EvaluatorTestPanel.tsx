import type { ReactNode } from "react";
import { FlaskConical, PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function EvaluatorTestPanel({
  open,
  onOpenChange,
  sampleSelector,
  testSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleSelector: ReactNode;
  testSection: ReactNode;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-6">
        {open ? (
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <h2 className="font-bold">Test with sample observations</h2>
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
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </div>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          {sampleSelector}
          {testSection}
        </div>
      ) : null}
    </aside>
  );
}
