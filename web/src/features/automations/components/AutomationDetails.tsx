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
  TriggerEventSource,
  type FilterState,
} from "@langfuse/shared";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DeleteAutomationDialogController } from "./DeleteAutomationDialogController";
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
  const [isFailureBannerDismissed, setIsFailureBannerDismissed] =
    useState(false);
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
        // Suppress 404 toast: after deletion the invalidation can refetch this
        // query before the component unmounts, producing a spurious error toast.
        meta: { silentHttpCodes: [404] },
      },
    );

  const { data: failureData } =
    api.automations.getCountOfConsecutiveFailures.useQuery(
      {
        projectId,
        automationId,
      },
      {
        enabled: Boolean(automation),
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
    return (
      <div className="py-4 text-center">Loading automation details...</div>
    );
  }

  if (!automation) {
    return (
      <div className="text-muted-foreground py-4 text-center">
        Automation not found.
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
    action: automation.action,
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
                  <Edit className="icon-base text-icon-foreground mr-2" />
                  Edit
                </Button>
                <DeleteAutomationDialogController
                  projectId={projectId}
                  automationId={automationId}
                  onSuccess={onDelete}
                >
                  {({ disabled, openDialog }) => (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-light-red flex items-center"
                      disabled={disabled !== undefined}
                      onClick={openDialog}
                    >
                      <span className="text-dark-red">Delete</span>
                    </Button>
                  )}
                </DeleteAutomationDialogController>
              </div>
            }
          />

          {!isFailureBannerDismissed &&
            failureData &&
            failureData.count >= 5 && (
              <AutomationFailureBanner
                failureCount={failureData.count}
                onDismiss={() => setIsFailureBannerDismissed(true)}
              />
            )}

          {automation.trigger.eventSource === TriggerEventSource.Monitor ? (
            <AutomationForm
              projectId={projectId}
              automation={automationForForm}
              isEditing={false}
            />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <Tabs.List variant="underline">
                <Tabs.Trigger value="executions" label="Execution History" />
                <Tabs.Trigger value="configuration" label="Configuration" />
              </Tabs.List>

              <Tabs.Content value="executions">
                <div className="mt-6">
                  <SettingsTableCard>
                    <AutomationExecutionsTable
                      projectId={projectId}
                      automationId={automationId}
                    />
                  </SettingsTableCard>
                </div>
              </Tabs.Content>

              <Tabs.Content value="configuration">
                <div className="mt-6">
                  <AutomationForm
                    projectId={projectId}
                    automation={automationForForm}
                    isEditing={false}
                  />
                </div>
              </Tabs.Content>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
};
