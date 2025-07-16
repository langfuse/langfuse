import React from "react";
import { api } from "@/src/utils/api";
import { JobConfigState, type AutomationDomain } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { StatusBadge } from "@/src/components/layouts/status-badge";

interface AutomationSidebarProps {
  projectId: string;
  selectedAutomation?: { automationId: string };
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

  const sidebarWidth = "w-40 sm:w-64";

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex h-full flex-col border-r bg-muted/10",
          sidebarWidth,
        )}
      >
        <div className="p-4 text-center text-sm text-muted-foreground">
          Loading webhooks...
        </div>
      </div>
    );
  }

  if (!automations || automations.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full flex-col border-r bg-muted/10",
          sidebarWidth,
        )}
      >
        <div className="p-4 text-center text-sm text-muted-foreground">
          No webhooks configured. Create your first webhook to automate
          workflows.
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex h-full flex-col border-r bg-muted/10", sidebarWidth)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <div className="space-y-2">
            {automations.map((automation) => {
              const isSelected =
                selectedAutomation?.automationId === automation.id;

              return (
                <div
                  key={automation.id}
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
