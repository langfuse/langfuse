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
import { FlaskConical, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";

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

  if (canUseExperimentsBetaToggle && !isExperimentsBetaEnabled) {
    return (
      <Page
        headerProps={{
          title: "Experiments",
        }}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          {/* Blurred background with gradient */}
          <div className="from-primary/5 via-background to-primary/10 absolute inset-0 bg-gradient-to-br" />
          <div className="absolute inset-0 backdrop-blur-[2px]" />

          {/* Floating decorative elements */}
          <div className="bg-primary/10 absolute top-1/4 left-1/4 h-32 w-32 animate-pulse rounded-full blur-3xl" />
          <div className="bg-primary/5 absolute right-1/4 bottom-1/4 h-40 w-40 animate-pulse rounded-full blur-3xl delay-1000" />

          {/* Main content card */}
          <div className="bg-card/80 relative z-10 mx-4 max-w-lg rounded-2xl border p-8 shadow-2xl backdrop-blur-sm">
            <div className="mb-6 flex justify-center">
              <div className="bg-primary/10 rounded-full p-4">
                <Sparkles className="text-primary h-8 w-8" />
              </div>
            </div>

            <h2 className="mb-3 text-center text-2xl font-semibold tracking-tight">
              New Experiments Views
            </h2>

            <ul className="text-muted-foreground mb-6 space-y-3 text-sm">
              <li>
                <span className="text-foreground block font-medium">
                  Built on Fast Preview
                </span>
                Experiments now leverage our rebuilt observation-centric data
                model for dramatically faster loading and filtering
              </li>
              <li>
                <span className="text-foreground block font-medium">
                  Decoupled from Datasets
                </span>
                Experiments is now a standalone first-class feature. Experiments
                run against local data are now visible in UI.
              </li>
              <li>
                <span className="text-foreground block font-medium">
                  Polished UI/UX with extended filtering
                </span>
                More intuitive interface with enhanced filtering capabilities to
                help you analyze and compare experiments efficiently
              </li>
            </ul>

            <div className="flex flex-col items-center gap-4">
              <div className="bg-background/50 flex items-center gap-3 rounded-lg border px-4 py-3">
                <Label
                  htmlFor="experiments-beta-toggle-hero"
                  className="cursor-pointer font-medium"
                >
                  Enable Experiments Beta
                </Label>
                <Switch
                  id="experiments-beta-toggle-hero"
                  checked={isExperimentsBetaEnabled}
                  onCheckedChange={setExperimentsBetaEnabled}
                />
              </div>

              <p className="text-muted-foreground text-center text-xs">
                You can turn this off anytime from the toggle in the header
              </p>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Experiments",
        actionButtonsLeft: canUseExperimentsBetaToggle ? (
          <ExperimentsBetaSwitch
            enabled={isExperimentsBetaEnabled}
            onEnabledChange={handleBetaSwitchChange}
          />
        ) : undefined,
        actionButtonsRight: (
          <div className="flex items-center gap-2">
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
      {isExperimentsBetaEnabled ? (
        <ExperimentsTable projectId={projectId} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}
    </Page>
  );
}
