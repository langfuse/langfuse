import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/Page";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Label } from "@/src/components/ui/label";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

export default function NewDashboardPage() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // State for new dashboard
  const [dashboardName, setDashboardName] = useState("New dashboard");
  const [dashboardDescription, setDashboardDescription] = useState("");
  const editorCapability = api.dashboardStudio.isEnabled.useQuery(
    { projectId },
    { enabled: Boolean(projectId), staleTime: 60_000 },
  );

  // Check project access
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  // Mutation for creating a new dashboard
  const createDashboard = api.dashboard.createDashboard.useMutation({
    onSuccess: async (data) => {
      if (editorCapability.data !== true)
        showSuccessToast({
          operation: "dashboard.create",
          title: "Dashboard created",
          description: "Your new dashboard has been created successfully",
        });
      await router.push(
        `/project/${projectId}/dashboards/${data.id}${editorCapability.data === true ? "/studio" : ""}`,
      );
    },
    onError: (error) => {
      showErrorToast(
        "Error creating dashboard",
        error.message,
        classifyTrpcToastError(error, "dashboard.create"),
      );
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
      showErrorToast("Validation error", "Dashboard name is required", {
        operation: "dashboard.create",
        errorOrigin: "frontend",
        errorCategory: "user_input",
      });
    }
  };

  return (
    <Page
      withPadding
      headerProps={{
        title: "Create dashboard",
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
                editorCapability.isPending ||
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
          <Label htmlFor="dashboard-name">Dashboard name</Label>
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
            placeholder="Describe this dashboard (optional)"
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
