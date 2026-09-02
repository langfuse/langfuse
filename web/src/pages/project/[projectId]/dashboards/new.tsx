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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function NewDashboard() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // State for new dashboard
  const [dashboardName, setDashboardName] = useState("New Dashboard");
  const [dashboardDescription, setDashboardDescription] = useState("");

  // Check project access
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const capture = usePostHogClientCapture();

  // Mutation for creating a new dashboard
  const createDashboard = api.dashboard.createDashboard.useMutation({
    onError: (error) => {
      showErrorToast("Error creating dashboard", error.message);
    },
  });

  // Handle form submission
  const handleCreateDashboard = () => {
    if (!dashboardName.trim()) {
      showErrorToast("Validation error", "Dashboard name is required");
      return;
    }

    const hasDescription = Boolean(dashboardDescription.trim());
    createDashboard.mutate(
      {
        projectId,
        name: dashboardName,
        description: dashboardDescription,
      },
      {
        onSuccess: (data) => {
          capture("dashboard:created", {
            source: "new_form",
            hasDescription,
          });
          showSuccessToast({
            title: "Dashboard created",
            description: "Your new dashboard has been created successfully",
          });
          router.push(`/project/${projectId}/dashboards/${data.id}`);
        },
      },
    );
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
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dashboard-description">Description</Label>
          <Textarea
            id="dashboard-description"
            value={dashboardDescription}
            onChange={(e) => {
              setDashboardDescription(e.target.value);
            }}
            placeholder="Describe the purpose of this dashboard. Optional, but very helpful."
            rows={4}
          />
        </div>

        <div className="text-muted-foreground text-sm">
          <p>
            After creating the dashboard, you can add widgets to visualize your
            data.
          </p>
        </div>
      </div>
    </Page>
  );
}
