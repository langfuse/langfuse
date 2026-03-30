import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { ExperimentsBetaSwitch } from "@/src/features/experiments/components/ExperimentsBetaSwitch";
import { ExperimentsTable } from "@/src/features/experiments/components/table";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function Experiments() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const {
    canAccessExperiments,
    canUseExperimentsBetaToggle,
    isExperimentsBetaActive,
    isExperimentsBetaEnabled,
    setExperimentsBetaEnabled,
  } = useExperimentAccess();

  const handleExperimentSuccess = async () => {
    setIsCreateExperimentDialogOpen(false);
    await Promise.all([
      utils.experiments.all.invalidate(),
      utils.experiments.countAll.invalidate(),
    ]);
  };

  const handleBetaSwitchChange = (checked: boolean) => {
    setExperimentsBetaEnabled(checked);

    if (!checked) {
      void router.push(`/project/${projectId}/datasets`);
    }
  };

  useEffect(() => {
    if (!canAccessExperiments && projectId) {
      void router.replace(`/project/${projectId}/datasets`);
    }
  }, [canAccessExperiments, projectId, router]);

  if (!canAccessExperiments) {
    return null;
  }

  return (
    <Page
      headerProps={{
        title: "Experiments",
        help: {
          description:
            "Experiments allow you to compare and analyze different runs of your LLM application. See docs to learn more.",
          href: "https://langfuse.com/docs/datasets/experiments",
        },
        actionButtonsRight: (
          <div className="flex items-center gap-2">
            {canUseExperimentsBetaToggle ? (
              <ExperimentsBetaSwitch
                enabled={isExperimentsBetaEnabled}
                onEnabledChange={handleBetaSwitchChange}
              />
            ) : null}
            <Dialog
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  disabled={!hasExperimentWriteAccess}
                  onClick={() => capture("dataset_run:new_form_open")}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="ml-2 hidden md:block">Run experiment</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <CreateExperimentsForm
                  key="create-experiment-form-project-experiments"
                  projectId={projectId}
                  setFormOpen={setIsCreateExperimentDialogOpen}
                  handleExperimentSuccess={handleExperimentSuccess}
                  showSDKRunInfoPage
                />
              </DialogContent>
            </Dialog>
          </div>
        ),
      }}
    >
      {isExperimentsBetaActive ? (
        <ExperimentsTable projectId={projectId} />
      ) : (
        <div className="p-4">
          <p>Experiments List View - Coming Soon</p>
        </div>
      )}
    </Page>
  );
}
