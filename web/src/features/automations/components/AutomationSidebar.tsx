import React from "react";
import { api } from "@/src/utils/api";
import { JobConfigState } from "@langfuse/shared";
import { type AutomationDomain } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { StatusBadge } from "@/src/components/layouts/status-badge";

interface AutomationSidebarProps {
  projectId: string;
  selectedAutomation?: { triggerId: string; actionId: string };
  onAutomationSelect: (automation: AutomationDomain) => void;
}

export const AutomationSidebar: React.FC<AutomationSidebarProps> = ({
  projectId,
  selectedAutomation,
  onAutomationSelect,
}) => {
  const { data: automations, isLoading } =
    api.automations.getAutomations.useQuery({
      projectId,
    });

  if (isLoading) {
    return (
      <div className="flex h-full w-40 flex-col border-r bg-muted/10 sm:w-80">
        <div className="p-4 text-center text-sm text-muted-foreground">
          Loading automations...
        </div>
      </div>
    );
  }

  if (!automations || automations.length === 0) {
    return (
      <div className="flex h-full w-40 flex-col border-r bg-muted/10 sm:w-80">
        <div className="p-4 text-center text-sm text-muted-foreground">
          No automations configured. Create your first automation to automate
          workflows.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-40 flex-col border-r bg-muted/10 sm:w-80">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="space-y-2">
            {automations.map((automation) => {
              const isSelected =
                selectedAutomation?.triggerId === automation.trigger.id &&
                selectedAutomation?.actionId === automation.action.id;

              return (
                <div
                  key={`${automation.trigger.id}-${automation.action.id}`}
                  className={cn(
                    "group relative rounded-lg border p-3 transition-colors hover:bg-background/50",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background/20",
                  )}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => onAutomationSelect(automation)}
                  >
                    <div className="space-y-2">
                      {/* Top row: Name and Active badge */}
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="truncate text-sm font-medium leading-tight">
                          {automation.name}
                        </h4>
                        {automation.trigger.status === JobConfigState.ACTIVE ? (
                          <StatusBadge type={"active"} />
                        ) : (
                          <StatusBadge type={"inactive"} />
                        )}
                      </div>

                      {/* Bottom row: eventSource -> automation type */}
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">
                          {automation.trigger.eventSource}
                        </span>
                        {" → "}
                        {automation.action.type === "WEBHOOK"
                          ? "Webhook"
                          : "Annotation Queue"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
