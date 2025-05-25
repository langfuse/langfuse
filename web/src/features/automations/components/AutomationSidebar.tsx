import React from "react";
import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { JobConfigState } from "@langfuse/shared";
import { Edit } from "lucide-react";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { cn } from "@/src/utils/tailwind";

interface AutomationSidebarProps {
  projectId: string;
  selectedAutomation?: { triggerId: string; actionId: string };
  onAutomationSelect: (automation: ActiveAutomation) => void;
  onEditAutomation?: (automation: ActiveAutomation) => void;
}

export const AutomationSidebar: React.FC<AutomationSidebarProps> = ({
  projectId,
  selectedAutomation,
  onAutomationSelect,
  onEditAutomation,
}) => {
  const { data: automations, isLoading } =
    api.automations.getAutomations.useQuery({
      projectId,
    });

  if (isLoading) {
    return (
      <div className="w-80 border-r bg-muted/10 p-4">
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading automations...
        </div>
      </div>
    );
  }

  if (!automations || automations.length === 0) {
    return (
      <div className="w-80 border-r bg-muted/10 p-4">
        <div className="py-4 text-center text-sm text-muted-foreground">
          No automations configured. Create your first automation to automate
          workflows.
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-r bg-muted/10">
      <div className="p-4">
        <h3 className="mb-4 text-lg font-semibold">Automations</h3>
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
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-16">
                      {/* Status - most prominent */}
                      <div className="mb-2 flex items-center gap-2">
                        {automation.trigger.status === JobConfigState.ACTIVE ? (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50"
                          >
                            Inactive
                          </Badge>
                        )}
                      </div>

                      {/* Title/Description */}
                      <h4 className="mb-2 truncate text-sm font-medium leading-tight">
                        {automation.trigger.description || "Unnamed Automation"}
                      </h4>

                      {/* Event source */}
                      <p className="mb-1 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {automation.trigger.eventSource}
                        </span>
                      </p>

                      {/* Action type and sampling */}
                      <p className="text-xs text-muted-foreground">
                        {automation.action.type === "WEBHOOK"
                          ? "Webhook"
                          : "Annotation Queue"}{" "}
                        • {automation.trigger.sampling.toNumber() * 100}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons - only show on hover or when selected */}
                <div
                  className={cn(
                    "absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity",
                    "group-hover:opacity-100",
                    isSelected && "opacity-100",
                  )}
                >
                  {onEditAutomation && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditAutomation(automation);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                  )}
                  <DeleteAutomationButton
                    projectId={projectId}
                    triggerId={automation.trigger.id}
                    actionId={automation.action.id}
                    variant="icon"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
