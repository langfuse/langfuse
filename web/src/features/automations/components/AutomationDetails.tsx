import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Edit } from "lucide-react";
import { AutomationForm } from "./automationForm";
import { AutomationExecutionsTable } from "./AutomationExecutionsTable";
import { Badge } from "@/src/components/ui/badge";
import { JobConfigState, type TriggerEventSource } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { observationFilterColumns } from "./automationForm";
import { Separator } from "@/src/components/ui/separator";
import { type FilterState } from "@langfuse/shared";
import { type ActiveAutomation } from "@langfuse/shared/src/server";

interface AutomationDetailsProps {
  projectId: string;
  triggerId: string;
  actionId: string;
  onEditSuccess?: () => void;
}

export const AutomationDetails: React.FC<AutomationDetailsProps> = ({
  projectId,
  triggerId,
  actionId,
  onEditSuccess,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const { data: automation, isLoading } =
    api.automations.getAutomation.useQuery(
      {
        projectId,
        triggerId,
        actionId,
      },
      {
        enabled: !!projectId && !!triggerId && !!actionId,
      },
    );

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    onEditSuccess?.();
  };

  if (isLoading) {
    return (
      <div className="py-4 text-center">Loading automation details...</div>
    );
  }

  if (!automation) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        Automation not found.
      </div>
    );
  }

  // Convert the automation data to match the expected format for the form
  const automationForForm: ActiveAutomation = {
    trigger: {
      ...automation.trigger,
      eventSource: automation.trigger.eventSource as TriggerEventSource,
      filter: automation.trigger.filter as FilterState,
    },
    action: {
      ...automation.action,
      config: automation.action.config as
        | { type: "WEBHOOK"; url: string; headers: Record<string, string> }
        | { type: "ANNOTATION_QUEUE"; queueId: string },
    },
  };

  return (
    <div className="flex flex-col space-y-6">
      {isEditing ? (
        <AutomationForm
          projectId={projectId}
          onSuccess={handleSaveEdit}
          onCancel={handleCancelEdit}
          automation={automationForForm}
          isEditing={true}
        />
      ) : (
        <>
          {/* Header with Edit Button */}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {automation.trigger.description || "Unnamed Automation"}
            </h2>
            <Button onClick={handleEdit}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>

          {/* Automation Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Automation Details
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
              </CardTitle>
              <CardDescription>
                Configuration and settings for this automation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium">Event Source</h4>
                  <p className="font-mono text-sm text-muted-foreground">
                    {automation.trigger.eventSource}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Action Type</h4>
                  <p className="text-sm text-muted-foreground">
                    {automation.action.type === "WEBHOOK"
                      ? "Webhook"
                      : "Annotation Queue"}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Sampling Rate</h4>
                  <p className="text-sm text-muted-foreground">
                    {automation.trigger.sampling.toNumber() * 100}%
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Delay</h4>
                  <p className="text-sm text-muted-foreground">
                    {automation.trigger.delay}ms
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-2 text-sm font-medium">Filter</h4>
                {automation.trigger.filter ? (
                  <InlineFilterBuilder
                    columns={observationFilterColumns}
                    filterState={automation.trigger.filter as FilterState}
                    onChange={() => {}}
                    disabled={true}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No filter</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Execution History */}
          <Card>
            <CardHeader>
              <CardTitle>Execution History</CardTitle>
              <CardDescription>
                Recent executions of this automation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AutomationExecutionsTable
                projectId={projectId}
                triggerId={triggerId}
                actionId={actionId}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
