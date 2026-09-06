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
import { useTranslations } from "next-intl";

export default function NewDashboard() {
  const t = useTranslations("evaluationAnalytics.dashboard");
  const extrasT = useTranslations("systemUi.dashboardExtras");
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // State for new dashboard
  const [dashboardName, setDashboardName] = useState(extrasT("newDefaultName"));
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
        title: t("createdTitle"),
        description: t("createdDescription"),
      });
      // Navigate to the newly created dashboard
      router.push(`/project/${projectId}/dashboards/${data.id}`);
    },
    onError: (error) => {
      showErrorToast(t("createFailed"), error.message);
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
      showErrorToast(t("validationError"), t("nameRequired"));
    }
  };

  return (
    <Page
      withPadding
      headerProps={{
        title: t("createTitle"),
        help: {
          description: t("createDescription"),
        },
        actionButtonsRight: (
          <>
            <Button
              variant="outline"
              onClick={() => router.push(`/project/${projectId}/dashboards`)}
            >
              {extrasT("cancel")}
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
              {extrasT("create")}
            </Button>
          </>
        ),
      }}
    >
      <div className="mx-auto my-8 max-w-xl space-y-6">
        <div className="space-y-2">
          <Label htmlFor="dashboard-name">{t("name")}</Label>
          <Input
            id="dashboard-name"
            value={dashboardName}
            onChange={(e) => {
              setDashboardName(e.target.value);
            }}
            placeholder={t("namePlaceholder")}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dashboard-description">
            {extrasT("description")}
          </Label>
          <Textarea
            id="dashboard-description"
            value={dashboardDescription}
            onChange={(e) => {
              setDashboardDescription(e.target.value);
            }}
            placeholder={t("descriptionPlaceholder")}
            rows={4}
          />
        </div>

        <div className="text-muted-foreground text-sm">
          <p>{extrasT("afterCreate")}</p>
        </div>
      </div>
    </Page>
  );
}
