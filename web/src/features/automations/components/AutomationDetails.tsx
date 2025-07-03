import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Edit } from "lucide-react";
import { AutomationForm } from "./automationForm";
import { AutomationExecutionsTable } from "./AutomationExecutionsTable";
import { AutomationFailureBanner } from "./AutomationFailureBanner";
import {
  type AutomationDomain,
  JobConfigState,
  type TriggerEventSource,
} from "@langfuse/shared";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { type FilterState } from "@langfuse/shared";
import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DeleteAutomationButton } from "./DeleteAutomationButton";
import { useQueryParam, StringParam, withDefault } from "use-query-params";

interface AutomationDetailsProps {
  projectId: string;
  automationId: string;
  onEditSuccess?: () => void;
  onEdit?: (automation: AutomationDomain) => void;
  onDelete?: () => void;
}

export const AutomationDetails: React.FC<AutomationDetailsProps> = ({
  projectId,
  automationId,
  onEditSuccess,
  onEdit,
  onDelete,
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
        automationId,
      },
      {
        enabled: !!projectId && !!automationId,
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

  const handleSaveEdit = () => {
    setIsEditing(false);
    onEditSuccess?.();
  };

  if (isLoading) {
    return <div className="py-4 text-center">Loading webhook details...</div>;
  }

  if (!automation) {
    return (
      <div className="py-4 text-center text-muted-foreground">
        Webhook not found.
      </div>
    );
  }

  const automationForForm: AutomationDomain = {
    id: automation.id,
    name: automation.name,
    trigger: {
      ...automation.trigger,
      eventSource: automation.trigger.eventSource as TriggerEventSource,
      filter: automation.trigger.filter as FilterState,
      eventActions: automation.trigger.eventActions,
    },
    action: {
      ...automation.action,
      config: automation.action.config as {
        type: "WEBHOOK";
        url: string;
        headers: Record<string, string>;
        apiVersion: Record<"prompt", "v1">;
        displaySecretKey: string;
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
                  automationId={automationId}
                  variant="button"
                  onSuccess={onDelete}
                />
              </div>
            }
          />

          <AutomationFailureBanner
            projectId={projectId}
            automationId={automationId}
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
                  automationId={automationId}
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
