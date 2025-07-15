import { useRouter } from "next/router";
import { AutomationSidebar } from "@/src/features/automations/components/AutomationSidebar";
import { AutomationDetails } from "@/src/features/automations/components/AutomationDetails";
import { AutomationForm } from "@/src/features/automations/components/automationForm";
import { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { type AutomationDomain } from "@langfuse/shared";
import { ErrorPage } from "@/src/components/error-page";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export default function AutomationsPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const projectId = router.query.projectId as string;
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [showSecretDialog, setShowSecretDialog] = useState(false);

  const [urlParams, setUrlParams] = useQueryParams({
    view: withDefault(StringParam, "list"),
    automationId: StringParam,
    tab: withDefault(StringParam, "executions"),
  });

  const { view, automationId } = urlParams;

  const selectedAutomation = useMemo(
    () => (automationId ? { automationId } : undefined),
    [automationId],
  );

  // Fetch automations to check if any exist
  const { data: automations } = api.automations.getAutomations.useQuery({
    projectId,
  });

  // Fetch editing automation when in edit mode
  const { data: editingAutomation, error: editingAutomationError } =
    api.automations.getAutomation.useQuery(
      {
        projectId,
        automationId: automationId!,
      },
      {
        enabled: view === "edit" && !!automationId,
      },
    );

  // Fetch automation for detail view to check if it exists
  const { error: automationDetailError } =
    api.automations.getAutomation.useQuery(
      {
        projectId,
        automationId: automationId!,
      },
      {
        enabled: view === "list" && !!selectedAutomation,
      },
    );

  // Helper function to navigate without creating history entry
  const navigateWithoutHistory = useCallback(
    (updates: { view?: string; automationId?: string; tab?: string }) => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const pathname = getPathnameWithoutBasePath();

      if (updates.view !== undefined) {
        params.set("view", updates.view);
      }
      if (updates.automationId !== undefined) {
        if (updates.automationId) {
          params.set("automationId", updates.automationId);
        } else {
          params.delete("automationId");
        }
      }
      if (updates.tab !== undefined) {
        params.set("tab", updates.tab);
      }

      router.replace(
        {
          pathname,
          query: params.toString(),
        },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  // Auto-select the topmost automation or clear selection if none exist
  useEffect(() => {
    if (automations !== undefined) {
      if (automations.length === 0 && selectedAutomation) {
        // Clear selected automation if no automations exist
        setUrlParams({
          view: "list",
          automationId: undefined,
          tab: urlParams.tab,
        });
      } else if (
        automations.length > 0 &&
        !selectedAutomation &&
        view === "list"
      ) {
        // Auto-select the topmost automation if none is currently selected
        // Use router.replace to avoid creating new history entry
        navigateWithoutHistory({
          automationId: automations[0].id,
        });
      }
    }
  }, [
    automations,
    selectedAutomation,
    view,
    setUrlParams,
    urlParams.tab,
    navigateWithoutHistory,
  ]);

  const handleCreateAutomation = () => {
    setUrlParams({
      view: "create",
      automationId: undefined,
      tab: urlParams.tab,
    });
  };

  const handleEditAutomation = (automation: AutomationDomain) => {
    setUrlParams({
      view: "edit",
      automationId: automation.id,
      tab: urlParams.tab,
    });
  };

  const handleReturnToList = () => {
    // Use router.replace to avoid creating history entry when canceling
    navigateWithoutHistory({
      view: "list",
    });
  };

  const handleCreateSuccess = (
    automationId?: string,
    webhookSecret?: string,
  ) => {
    // Show webhook secret if provided
    if (webhookSecret) {
      setWebhookSecret(webhookSecret);
      setShowSecretDialog(true);
    }

    // Navigate to the newly created automation detail page without history entry
    if (automationId) {
      navigateWithoutHistory({
        view: "list",
        automationId,
        tab: urlParams.tab,
      });
    } else {
      navigateWithoutHistory({
        view: "list",
      });
    }
  };

  const handleEditSuccess = () => {
    // Return to detail view of the edited automation without history entry
    utils.automations.invalidate();
    navigateWithoutHistory({
      view: "list",
    });
  };

  const handleAutomationSelect = (automation: AutomationDomain) => {
    setUrlParams({
      view: "list",
      automationId: automation.id,
      tab: urlParams.tab, // Preserve the current tab selection
    });
  };

  const handleDeleteAutomation = () => {
    // Find the current automation index
    if (!automations || !selectedAutomation) return;

    const currentIndex = automations.findIndex(
      (automation) => automation.id === selectedAutomation.automationId,
    );

    if (currentIndex === -1) return;

    // Select the next automation, or the previous one if this was the last
    let nextIndex: number;
    if (currentIndex < automations.length - 1) {
      // Select the next automation
      nextIndex = currentIndex + 1;
    } else if (currentIndex > 0) {
      // Select the previous automation (this was the last one)
      nextIndex = currentIndex - 1;
    } else {
      // This was the only automation, clear selection
      setUrlParams({
        view: "list",
        automationId: undefined,
        tab: urlParams.tab,
      });
      return;
    }

    const nextAutomation = automations[nextIndex];
    if (nextAutomation) {
      setUrlParams({
        view: "list",
        automationId: nextAutomation.id,
        tab: urlParams.tab,
      });
    }
  };

  const renderAutomationNotFoundError = (message: string) => (
    <ErrorPage
      title="Webhook not found"
      message={message}
      additionalButton={{
        label: "Back to Webhooks",
        onClick: () => {
          setUrlParams({
            view: "list",
            automationId: undefined,
            tab: urlParams.tab,
          });
        },
      }}
    />
  );

  const renderMainContent = () => {
    // Handle 404 errors for edit view
    if (view === "edit" && editingAutomationError?.data?.code === "NOT_FOUND") {
      return renderAutomationNotFoundError(
        "The webhook you're trying to edit doesn't exist or has been deleted.",
      );
    }

    // Handle 404 errors for detail view
    if (
      view === "list" &&
      selectedAutomation &&
      automationDetailError?.data?.code === "NOT_FOUND"
    ) {
      return renderAutomationNotFoundError(
        "The webhook you're looking for doesn't exist or has been deleted.",
      );
    }

    if (view === "create") {
      return (
        <div className="h-full p-6">
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
        <div className="h-full p-6">
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
        <div className="h-full p-6">
          <AutomationDetails
            key={selectedAutomation.automationId}
            projectId={projectId}
            automationId={selectedAutomation.automationId}
            onEditSuccess={handleEditSuccess}
            onEdit={handleEditAutomation}
            onDelete={handleDeleteAutomation}
          />
        </div>
      );
    }

    return (
      <div className="h-full p-6">
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center">
            <h3 className="text-lg font-medium">Select a webhook</h3>
            <p className="mt-2 text-sm">
              Choose a webhook from the sidebar to view its details and
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
        title: "Webhooks",
        breadcrumb: [
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
        ],
        actionButtonsRight: (
          <Button onClick={handleCreateAutomation}>
            <Plus className="mr-2 h-4 w-4" />
            Create Webhook
          </Button>
        ),
      }}
    >
      <div className="h-full overflow-hidden contain-layout">
        <div className="flex h-full">
          <AutomationSidebar
            projectId={projectId}
            selectedAutomation={selectedAutomation}
            onAutomationSelect={handleAutomationSelect}
          />
          <div className="flex-1 overflow-auto">{renderMainContent()}</div>
        </div>
      </div>
      {/* Webhook Secret Dialog */}
      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Webhook Secret Created</DialogTitle>
            <DialogDescription>
              Your automation has been created successfully. Please copy the
              webhook secret below - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {webhookSecret && (
              <WebhookSecretRender webhookSecret={webhookSecret} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowSecretDialog(false);
                setWebhookSecret(null);
              }}
            >
              {"I've saved the secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
