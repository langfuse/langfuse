import { useRouter } from "next/router";
import { AutomationSidebar } from "@/src/features/automations/components/AutomationSidebar";
import { AutomationDetails } from "@/src/features/automations/components/AutomationDetails";
import { AutomationForm } from "@/src/features/automations/components/automationForm";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";

export default function AutomationsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [selectedAutomation, setSelectedAutomation] = useState<
    { triggerId: string; actionId: string } | undefined
  >(undefined);
  const [editingAutomation, setEditingAutomation] = useState<
    ActiveAutomation | undefined
  >(undefined);

  // Fetch automations to check if any exist
  const { data: automations } = api.automations.getAutomations.useQuery({
    projectId,
  });

  // Check if there are URL parameters for a specific automation
  useEffect(() => {
    const { triggerId, actionId } = router.query;
    if (
      triggerId &&
      actionId &&
      typeof triggerId === "string" &&
      typeof actionId === "string"
    ) {
      setSelectedAutomation({ triggerId, actionId });
      setView("list");
    }
  }, [router.query]);

  // Clear selected automation if no automations exist
  useEffect(() => {
    if (
      automations !== undefined &&
      automations.length === 0 &&
      selectedAutomation
    ) {
      setSelectedAutomation(undefined);
      // Also clear URL parameters
      const newUrl = `/project/${projectId}/automations`;
      window.history.replaceState(null, "", newUrl);
    }
  }, [automations, selectedAutomation, projectId]);

  const handleCreateAutomation = () => {
    setView("create");
    setSelectedAutomation(undefined);
    setEditingAutomation(undefined);
  };

  const handleEditAutomation = (automation: ActiveAutomation) => {
    setEditingAutomation(automation);
    setView("edit");
  };

  const handleReturnToList = () => {
    setView("list");
    setEditingAutomation(undefined);
    // Refresh the selected automation if we were editing it
    if (editingAutomation && selectedAutomation) {
      setSelectedAutomation({
        triggerId: editingAutomation.trigger.id,
        actionId: editingAutomation.action.id,
      });
    }
  };

  const handleAutomationSelect = (automation: ActiveAutomation) => {
    setSelectedAutomation({
      triggerId: automation.trigger.id,
      actionId: automation.action.id,
    });
    setView("list");

    // Update URL without navigation
    const newUrl = `/project/${projectId}/automations?triggerId=${automation.trigger.id}&actionId=${automation.action.id}`;
    window.history.replaceState(null, "", newUrl);
  };

  const renderMainContent = () => {
    if (view === "create") {
      return (
        <div className="flex-1 overflow-auto p-6">
          <AutomationForm
            projectId={projectId}
            onSuccess={handleReturnToList}
            onCancel={handleReturnToList}
            isEditing={false}
          />
        </div>
      );
    }

    if (view === "edit" && editingAutomation) {
      return (
        <div className="flex-1 overflow-auto p-6">
          <AutomationForm
            projectId={projectId}
            onSuccess={handleReturnToList}
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
            onEditSuccess={handleReturnToList}
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
          onEditAutomation={handleEditAutomation}
        />
        {renderMainContent()}
      </div>
    </Page>
  );
}
