import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import {
  Edit,
  ArrowRight,
  Webhook,
  ListTodo,
  Filter,
  Clock,
  Percent,
  Zap,
  Settings,
} from "lucide-react";
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
import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { WebhookActionConfig } from "./WebhookActionConfig";
import { AnnotationQueueActionConfig } from "./AnnotationQueueActionConfig";

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

  // Helper function to get action icon
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "WEBHOOK":
        return <Webhook className="h-5 w-5" />;
      case "ANNOTATION_QUEUE":
        return <ListTodo className="h-5 w-5" />;
      default:
        return <Settings className="h-5 w-5" />;
    }
  };

  // Helper function to render action config details
  const renderActionConfig = (config: any) => {
    switch (config.type) {
      case "WEBHOOK":
        return <WebhookActionConfig config={config} />;
      case "ANNOTATION_QUEUE":
        return (
          <AnnotationQueueActionConfig projectId={projectId} config={config} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
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
          <Header
            title={automation.trigger.description || "Unnamed Automation"}
            status={
              automation.trigger.status === JobConfigState.ACTIVE
                ? "active"
                : "inactive"
            }
            actionButtons={
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            }
          />

          {/* Workflow Overview */}
          <div>
            {/* Workflow Visualization */}
            <div className="flex items-stretch gap-4">
              {/* Trigger Card */}
              <Card className="flex-1 border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <Zap className="h-4 w-4 text-blue-600" />
                    </div>
                    Trigger Configuration
                  </CardTitle>
                  <CardDescription>
                    How this automation is triggered
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium">Event Source</h4>
                      <p className="font-mono text-sm text-muted-foreground">
                        {automation.trigger.eventSource}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="flex items-center gap-1 text-sm font-medium">
                          <Percent className="h-3 w-3" />
                          Sampling Rate
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {automation.trigger.sampling.toNumber() * 100}%
                        </p>
                      </div>
                      <div>
                        <h4 className="flex items-center gap-1 text-sm font-medium">
                          <Clock className="h-3 w-3" />
                          Delay
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {automation.trigger.delay}ms
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="min-h-[120px]">
                      <h4 className="mb-3 flex items-center gap-1 text-sm font-medium">
                        <Filter className="h-3 w-3" />
                        Filter Conditions
                      </h4>
                      {automation.trigger.filter ? (
                        <InlineFilterBuilder
                          columns={observationFilterColumns}
                          filterState={automation.trigger.filter as FilterState}
                          onChange={() => {}}
                          disabled={true}
                        />
                      ) : (
                        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                          No filter conditions - triggers on all events
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Arrow */}
              <div className="flex items-center justify-center self-stretch">
                <ArrowRight className="h-6 w-6 text-muted-foreground" />
              </div>

              {/* Action Card */}
              <Card className="flex-1 border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="rounded-lg bg-green-100 p-2">
                      {getActionIcon(automation.action.type)}
                    </div>
                    Action Configuration
                  </CardTitle>
                  <CardDescription>
                    What happens when the trigger fires
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium">Action Type</h4>
                      <p className="text-sm text-muted-foreground">
                        {automation.action.type === "WEBHOOK"
                          ? "Webhook"
                          : "Annotation Queue"}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium">Action Name</h4>
                      <p className="text-sm text-muted-foreground">
                        {automation.action.name}
                      </p>
                    </div>

                    <Separator />

                    <div className="min-h-[120px]">
                      <h4 className="mb-3 text-sm font-medium">
                        Configuration Details
                      </h4>
                      {renderActionConfig(automation.action.config)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <Header title="Execution History" />
            <Card>
              <CardHeader>
                <CardDescription>
                  Recent executions of this automation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingsTableCard>
                  <AutomationExecutionsTable
                    projectId={projectId}
                    triggerId={triggerId}
                    actionId={actionId}
                  />
                </SettingsTableCard>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
