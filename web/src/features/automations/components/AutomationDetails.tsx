import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Edit } from "lucide-react";
import { AutomationForm } from "./automationForm";
import { AutomationExecutionsTable } from "./AutomationExecutionsTable";
import { JobConfigState, type TriggerEventSource } from "@langfuse/shared";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { type FilterState } from "@langfuse/shared";
import { type ActiveAutomation as FullActiveAutomation } from "@langfuse/shared/src/server";
import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { useQueryParam, StringParam, withDefault } from "use-query-params";

interface AutomationDetailsProps {
  projectId: string;
  triggerId: string;
  actionId: string;
  onEditSuccess?: () => void;
  onEdit?: (automation: FullActiveAutomation) => void;
}

// Omit eventAction temporarily from ActiveAutomation type as it is not yet available in the shared types
// This is a temporary workaround to avoid type errors until the shared types are updated
// It will be added back once the shared types are updated
type ActiveAutomation = Omit<FullActiveAutomation, "trigger"> & {
  trigger: Omit<FullActiveAutomation["trigger"], "eventAction"> & {
    eventAction?: string[];
  };
};

export const AutomationDetails: React.FC<AutomationDetailsProps> = ({
  projectId,
  triggerId,
  actionId,
  onEditSuccess,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useQueryParam(
    "tab",
    withDefault(StringParam, "executions"),
  );

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
    if (onEdit && automation) {
      onEdit(automation);
    } else {
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = (triggerId?: string, actionId?: string) => {
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
    name: automation.name,
    trigger: {
      ...automation.trigger,
      eventSource: automation.trigger.eventSource as TriggerEventSource,
      filter: automation.trigger.filter as FilterState,
      eventAction: automation.trigger.eventActions,
    },
    action: {
      ...automation.action,
      config: automation.action.config as {
        type: "WEBHOOK";
        url: string;
        headers: Record<string, string>;
        apiVersion: Record<"prompt", "v1">;
      },
    },
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
            title={automation.name}
            status={
              automation.trigger.status === JobConfigState.ACTIVE
                ? "active"
                : "inactive"
            }
            actionButtons={
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <DeleteAutomationButton
                  projectId={projectId}
                  triggerId={automation.trigger.id}
                  actionId={automation.action.id}
                  variant="button"
                />
              </div>
            }
          />

          <TabsBar
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsBarList>
              <TabsBarTrigger value="executions">
                Execution History
              </TabsBarTrigger>
              <TabsBarTrigger value="configuration">
                Configuration
              </TabsBarTrigger>
            </TabsBarList>

            <TabsBarContent value="executions" className="mt-6">
              <SettingsTableCard>
                <AutomationExecutionsTable
                  projectId={projectId}
                  triggerId={triggerId}
                  actionId={actionId}
                  eventSource={automation.trigger.eventSource}
                />
              </SettingsTableCard>
            </TabsBarContent>

            <TabsBarContent value="configuration" className="mt-6">
              <AutomationForm
                projectId={projectId}
                automation={automationForForm}
                isEditing={false}
              />
            </TabsBarContent>
          </TabsBar>
        </>
      )}
    </div>
  );
};
