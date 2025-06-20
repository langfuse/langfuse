import { useRouter } from "next/router";
import { AutomationSidebar } from "@/src/features/automations/components/AutomationSidebar";
import { AutomationDetails } from "@/src/features/automations/components/AutomationDetails";
import { AutomationForm } from "@/src/features/automations/components/automationForm";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { useQueryParams, StringParam, withDefault } from "use-query-params";

export default function AutomationsPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const projectId = router.query.projectId as string;

  const [urlParams, setUrlParams] = useQueryParams({
    view: withDefault(StringParam, "list"),
    triggerId: StringParam,
    actionId: StringParam,
    tab: withDefault(StringParam, "executions"),
  });

  const { view, triggerId, actionId } = urlParams;

  const selectedAutomation =
    triggerId && actionId ? { triggerId, actionId } : undefined;

  // Fetch automations to check if any exist
  const { data: automations } = api.automations.getAutomations.useQuery({
    projectId,
  });

  // Fetch editing automation when in edit mode
  const { data: editingAutomation } = api.automations.getAutomation.useQuery(
    {
      projectId,
      triggerId: triggerId!,
      actionId: actionId!,
    },
    {
      enabled: view === "edit" && !!triggerId && !!actionId,
    },
  );

  // Clear selected automation if no automations exist
  useEffect(() => {
    if (
      automations !== undefined &&
      automations.length === 0 &&
      selectedAutomation
    ) {
      setUrlParams({
        view: "list",
        triggerId: undefined,
        actionId: undefined,
        tab: urlParams.tab,
      });
    }
  }, [automations, selectedAutomation, projectId, setUrlParams, urlParams.tab]);

  const handleCreateAutomation = () => {
    setUrlParams({
      view: "create",
      triggerId: undefined,
      actionId: undefined,
      tab: urlParams.tab,
    });
  };

  const handleEditAutomation = (automation: ActiveAutomation) => {
    setUrlParams({
      view: "edit",
      triggerId: automation.trigger.id,
      actionId: automation.action.id,
      tab: urlParams.tab,
    });
  };

  const handleReturnToList = () => {
    setUrlParams({
      ...urlParams,
      view: "list",
    });
  };

  const handleCreateSuccess = (triggerId?: string, actionId?: string) => {
    // Navigate to the newly created automation detail page
    if (triggerId && actionId) {
      setUrlParams({
        view: "list",
        triggerId,
        actionId,
        tab: urlParams.tab,
      });
    } else {
      setUrlParams({
        ...urlParams,
        view: "list",
      });
    }
  };

  const handleEditSuccess = () => {
    // Return to detail view of the edited automation
    utils.automations.invalidate();
    setUrlParams({
      ...urlParams,
      view: "list",
    });
  };

  const handleAutomationSelect = (automation: ActiveAutomation) => {
    setUrlParams({
      view: "list",
      triggerId: automation.trigger.id,
      actionId: automation.action.id,
      tab: urlParams.tab, // Preserve the current tab selection
    });
  };

  const renderMainContent = () => {
    if (view === "create") {
      return (
        <div className="flex-1 overflow-auto p-6">
          <AutomationForm
            projectId={projectId}
            onSuccess={handleCreateSuccess}
            onCancel={handleReturnToList}
            isEditing={true}
          />
        </div>
      );
    }

    if (view === "edit" && editingAutomation) {
      return (
        <div className="flex-1 overflow-auto p-6">
          <AutomationForm
            projectId={projectId}
            onSuccess={handleEditSuccess}
            onCancel={handleReturnToList}
            automation={editingAutomation}
            isEditing={true}
          />
        </div>
      );
    }

    if (selectedAutomation) {
      return (
        <div className="flex-1 overflow-auto p-6">
          <AutomationDetails
            key={`${selectedAutomation.triggerId}-${selectedAutomation.actionId}`}
            projectId={projectId}
            triggerId={selectedAutomation.triggerId}
            actionId={selectedAutomation.actionId}
            onEditSuccess={handleEditSuccess}
            onEdit={handleEditAutomation}
          />
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center">
            <h3 className="text-lg font-medium">Select an automation</h3>
            <p className="mt-2 text-sm">
              Choose an automation from the sidebar to view its details and
              execution history.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Page
      headerProps={{
        title: "Automations",
        breadcrumb: [
          {
            name: "Automations",
            href: `/project/${projectId}/automations`,
          },
        ],
        actionButtonsRight: (
          <Button onClick={handleCreateAutomation}>
            <Plus className="mr-2 h-4 w-4" />
            Create Automation
          </Button>
        ),
      }}
    >
      <div className="flex h-full">
        <AutomationSidebar
          projectId={projectId}
          selectedAutomation={selectedAutomation}
          onAutomationSelect={handleAutomationSelect}
        />
        {renderMainContent()}
      </div>
    </Page>
  );
}
