import React from "react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { JobConfigState } from "@langfuse/shared";
import { Edit } from "lucide-react";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { observationFilterColumns } from "@/src/features/automations/components/automationForm";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { type ActiveAutomation } from "@langfuse/shared/src/server";

interface AutomationsListProps {
  projectId: string;
  onEditAutomation?: (automation: ActiveAutomation) => void;
}

export const AutomationsList = ({
  projectId,
  onEditAutomation,
}: AutomationsListProps) => {
  const { data: automations, isLoading } =
    api.automations.getAutomations.useQuery({
      projectId,
    });

  if (isLoading) {
    return <div className="py-4 text-center">Loading automations...</div>;
  }

  if (!automations || automations.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        No automations configured. Create your first automation to automate
        workflows.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {automations.map((automation) => (
        <Card key={automation.trigger.id} className="relative">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">
                  {automation.trigger.description || "Unnamed Automation"}
                </CardTitle>
                <CardDescription className="mt-1 flex items-center gap-2 text-xs">
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
                  <span>
                    Event source:{" "}
                    <span className="font-mono text-xs">
                      {automation.trigger.eventSource}
                    </span>
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {onEditAutomation && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onEditAutomation(automation)}
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
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="text-sm">
              <p>
                <strong>Filter:</strong>{" "}
                {automation.trigger.filter ? (
                  <div className="mt-2">
                    <InlineFilterBuilder
                      columns={observationFilterColumns}
                      filterState={automation.trigger.filter}
                      onChange={() => {}}
                      disabled={true}
                    />
                  </div>
                ) : (
                  "No filter"
                )}
              </p>
              <p className="mt-2">
                <strong>Sampling:</strong>{" "}
                {automation.trigger.sampling.toNumber() * 100}%
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
