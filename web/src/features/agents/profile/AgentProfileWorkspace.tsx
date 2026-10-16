import { useId, useRef, type ReactNode } from "react";
import { PanelRight, X } from "lucide-react";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

export function AgentProfileWorkspace({
  navigation,
  status,
  details,
  detailsOpen,
  onDetailsOpenChange,
  children,
}: {
  navigation: ReactNode;
  status: ReactNode;
  details: ReactNode;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const detailsId = useId();
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  return (
    <section
      aria-label="Agent workspace"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3">
        <div className="min-w-0 flex-1 overflow-x-auto">{navigation}</div>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          <Button
            text="Agent details"
            icon={PanelRight}
            variant="secondary"
            size="sm"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            ref={detailsTrigger}
            onClick={() => onDetailsOpenChange(!detailsOpen)}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          aria-label="Agent data"
          className={
            detailsOpen
              ? "hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex"
              : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          }
        >
          {children}
        </section>
        <aside
          id={detailsId}
          aria-label="Agent details"
          className={
            detailsOpen
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:w-80 lg:flex-none lg:border-l"
              : "hidden"
          }
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
            <h2 className="text-sm font-bold">Agent details</h2>
            <IconButton
              icon={X}
              label="Close agent details"
              size="sm"
              onClick={() => {
                onDetailsOpenChange(false);
                detailsTrigger.current?.focus();
              }}
            />
          </div>
          <section
            aria-label="Agent detail content"
            className="min-h-0 flex-1 overflow-y-auto p-3"
          >
            {detailsOpen && details}
          </section>
        </aside>
      </div>
    </section>
  );
}
