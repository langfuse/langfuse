import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Label } from "@/src/components/ui/label";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { InAppAgentDashboardComposer } from "@/src/ee/features/in-app-agent/components/InAppAgentDashboardButtons";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";

export default function NewDashboard() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  const { dashboardOwnership } = useInAppAiAgent();
  const isAssistantOwned = dashboardOwnership !== null;

  // State for new dashboard
  const [dashboardName, setDashboardName] = useState("New Dashboard");
  const [dashboardDescription, setDashboardDescription] = useState("");

  // Check project access
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  // Mutation for creating a new dashboard
  const createDashboard = api.dashboard.createDashboard.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Dashboard created",
        description: "Your new dashboard has been created successfully",
      });
      // Navigate to the newly created dashboard
      router.push(`/project/${projectId}/dashboards/${data.id}`);
    },
    onError: (error) => {
      showErrorToast("Error creating dashboard", error.message);
    },
  });

  // Handle form submission
  const handleCreateDashboard = () => {
    if (dashboardName.trim()) {
      createDashboard.mutate({
        projectId,
        name: dashboardName,
        description: dashboardDescription,
      });
    } else {
      showErrorToast("Validation error", "Dashboard name is required");
    }
  };

  return (
    <Page
      withPadding
      headerProps={{
        title: "Create Dashboard",
        help: {
          description: "Create a new dashboard for your project",
        },
        actionButtonsRight: (
          <>
            <Button
              variant="outline"
              onClick={() => router.push(`/project/${projectId}/dashboards`)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDashboard}
              disabled={
                !dashboardName.trim() ||
                createDashboard.isPending ||
                isAssistantOwned ||
                !hasCUDAccess
              }
              loading={createDashboard.isPending}
            >
              Create
            </Button>
          </>
        ),
      }}
    >
      <div className="mx-auto my-8 max-w-xl space-y-6">
        <div className="space-y-2">
          <Label htmlFor="dashboard-name">Dashboard Name</Label>
          <Input
            id="dashboard-name"
            value={dashboardName}
            onChange={(e) => {
              setDashboardName(e.target.value);
            }}
            placeholder="Enter dashboard name"
            required
            disabled={isAssistantOwned}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dashboard-description">Purpose</Label>
          <Textarea
            id="dashboard-description"
            value={dashboardDescription}
            onChange={(e) => {
              setDashboardDescription(e.target.value);
            }}
            placeholder="Describe what this dashboard should help you monitor or understand."
            rows={4}
            disabled={isAssistantOwned}
          />
        </div>

        {hasCUDAccess && (
          <InAppAgentDashboardComposer
            name={dashboardName}
            description={dashboardDescription}
          />
        )}

        {isAssistantOwned && (
          <p className="border-border bg-muted/30 rounded-md border p-3 text-sm">
            The assistant owns this dashboard draft while it is running. Manual
            changes will be available again when the run finishes.
          </p>
        )}

        <p className="text-muted-foreground text-sm">
          You can also create the empty dashboard now and add widgets manually
          later.
        </p>
      </div>
    </Page>
  );
}
