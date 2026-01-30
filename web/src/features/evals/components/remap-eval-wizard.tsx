import { useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { api } from "@/src/utils/api";
import { InnerEvaluatorForm } from "@/src/features/evals/components/inner-evaluator-form";
import {
  mapLegacyToModernTarget,
  isLegacyEvalTarget,
  isTraceTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { type PartialConfig } from "@/src/features/evals/types";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import { useSynchronizedScroll } from "@/src/features/evals/hooks/useSynchronizedScroll";

interface RemapEvalWizardProps {
  projectId: string;
  evalConfigId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type LegacyEvalAction = "keep-active" | "mark-inactive" | "delete";

export function RemapEvalWizard({
  projectId,
  evalConfigId,
  open,
  onOpenChange,
  onSuccess,
}: RemapEvalWizardProps) {
  const evalCapabilities = useEvalCapabilities(projectId);

  const [error, setError] = useState<string | null>(null);
  const [legacyAction, setLegacyAction] =
    useState<LegacyEvalAction>("mark-inactive");
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // Fetch old eval config
  const { data: oldConfig, isLoading: isLoadingConfig } =
    api.evals.configById.useQuery(
      { projectId, id: evalConfigId },
      { enabled: open },
    );

  // Fetch eval template
  const { data: evalTemplate, isLoading: isLoadingTemplate } =
    api.evals.templateById.useQuery(
      {
        projectId,
        id: oldConfig?.evalTemplateId ?? "",
      },
      { enabled: open && !!oldConfig?.evalTemplateId },
    );

  const utils = api.useUtils();

  // Update mutation to set old eval to INACTIVE
  const updateJobMutation = api.evals.updateEvalJob.useMutation({
    onSuccess: () => {
      utils.evals.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message ?? "Failed to update old eval configuration");
    },
  });

  // Delete mutation to remove old eval
  const deleteJobMutation = api.evals.deleteEvalJob.useMutation({
    onSuccess: () => {
      utils.evals.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message ?? "Failed to delete old eval configuration");
    },
  });

  // Map old config to new config with modern target
  // Only copy scoreName - filters and variable mapping will be initialized fresh
  const mappedConfig: PartialConfig | null = useMemo(() => {
    if (!oldConfig) return null;

    return {
      projectId: oldConfig.projectId,
      evalTemplateId: oldConfig.evalTemplateId,
      scoreName: oldConfig.scoreName,
      targetObject: mapLegacyToModernTarget(oldConfig.targetObject),
      jobType: oldConfig.jobType,
      filter: [],
      variableMapping: [],
      sampling: oldConfig.sampling,
      delay: oldConfig.delay,
      status: "ACTIVE",
      // Always set to NEW for remapped evals - new eval types cannot run on existing data
      timeScope: ["NEW"],
    };
  }, [oldConfig]);

  // Validate that old config is actually legacy
  const isValidForRemapping = useMemo(() => {
    if (!oldConfig) return false;
    return isLegacyEvalTarget(oldConfig.targetObject);
  }, [oldConfig]);

  const handleFormSuccess = async () => {
    if (!oldConfig) return;

    try {
      switch (legacyAction) {
        case "keep-active":
          // Do nothing - both old and new evals will be active
          utils.evals.invalidate();
          onOpenChange(false);
          onSuccess?.();
          break;
        case "mark-inactive":
          // Set old eval to INACTIVE
          await updateJobMutation.mutateAsync({
            projectId,
            evalConfigId,
            config: {
              status: "INACTIVE",
            },
          });
          break;
        case "delete":
          // Delete old eval
          await deleteJobMutation.mutateAsync({
            projectId,
            evalConfigId,
          });
          break;
      }
    } catch (err) {
      // Error already handled in mutation onError
      console.error(`Failed to ${legacyAction} old eval:`, err);
    }
  };

  const isLoading = isLoadingConfig || isLoadingTemplate;

  // Synchronized scrolling between left (legacy) and right (new) config panels
  useSynchronizedScroll(leftScrollRef, rightScrollRef, [
    isLoading,
    oldConfig,
    evalTemplate,
  ]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col" size="xxl">
        <DialogHeader>
          <DialogTitle>Upgrade Evaluator</DialogTitle>
          <DialogDescription>
            Review your legacy evaluator on the left and configure the new eval
            settings on the right.{" "}
            <a
              href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-dark-blue hover:opacity-80"
            >
              Follow our step-by-step guide
            </a>{" "}
            to upgrade successfully.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid flex-1 grid-cols-2 gap-6 overflow-auto">
            <Skeleton className="h-full w-full" />
            <Skeleton className="h-full w-full" />
          </div>
        ) : !isValidForRemapping ? (
          <Alert variant="destructive">
            <AlertDescription>
              This eval configuration is not a legacy eval and does not need
              remapping.
            </AlertDescription>
          </Alert>
        ) : !oldConfig || !evalTemplate ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load eval configuration or template.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid flex-1 grid-cols-[1fr_2px_1fr] overflow-hidden">
            {/* LEFT: Read-only old config */}
            <div className="flex flex-col space-y-4 overflow-hidden p-3">
              <div className="flex items-center gap-2 bg-background pb-2">
                <h3 className="text-lg font-semibold">
                  Legacy Configuration{" "}
                  {isTraceTarget(oldConfig.targetObject)
                    ? "(runs on traces)"
                    : ""}
                </h3>
                <span className="text-xs text-muted-foreground">Read-only</span>
              </div>
              <div ref={leftScrollRef} className="flex-1 overflow-auto">
                <InnerEvaluatorForm
                  projectId={projectId}
                  evalTemplate={evalTemplate}
                  useDialog={false}
                  disabled={true}
                  existingEvaluator={oldConfig}
                  mode="edit"
                  hideTargetSection={false}
                  hideTargetSelection={true}
                  hideAdvancedSettings={true}
                  preventRedirect={true}
                  renderFooter={() => null}
                  evalCapabilities={evalCapabilities}
                />
              </div>
            </div>

            <Separator orientation="vertical" className="h-full" />

            {/* RIGHT: Editable new config form */}
            <div className="flex flex-col space-y-4 overflow-hidden p-3">
              <h3 className="bg-background pb-2 text-lg font-semibold">
                New Configuration{" "}
                {isTraceTarget(oldConfig.targetObject)
                  ? "(runs on observations)"
                  : ""}
              </h3>
              <div ref={rightScrollRef} className="flex-1 overflow-auto">
                <InnerEvaluatorForm
                  projectId={projectId}
                  evalTemplate={evalTemplate}
                  useDialog={false}
                  existingEvaluator={mappedConfig ?? undefined}
                  onFormSuccess={handleFormSuccess}
                  mode="create"
                  hideTargetSection={false}
                  hideTargetSelection={true}
                  preventRedirect={true}
                  hideAdvancedSettings={true}
                  evalCapabilities={evalCapabilities}
                  renderFooter={({ isLoading, formError }) => (
                    <div className="flex w-full flex-col items-end gap-4">
                      <div className="flex items-center">
                        <Button
                          type="submit"
                          loading={isLoading}
                          className="mt-3 rounded-l-md rounded-r-none"
                        >
                          {legacyAction === "keep-active"
                            ? "Save & keep legacy active"
                            : legacyAction === "mark-inactive"
                              ? "Save & mark legacy inactive"
                              : "Save & delete legacy"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              disabled={isLoading}
                              className="mt-3 rounded-l-none rounded-r-md border-l-2"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setLegacyAction("keep-active")}
                            >
                              {legacyAction === "keep-active" && "✓ "}
                              Save & keep legacy active
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setLegacyAction("mark-inactive")}
                            >
                              {legacyAction === "mark-inactive" && "✓ "}
                              Save & mark legacy inactive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setLegacyAction("delete")}
                            >
                              {legacyAction === "delete" && "✓ "}
                              Save & delete legacy
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {formError ? (
                        <p className="text-red w-full text-center">
                          <span className="font-bold">Error:</span> {formError}
                        </p>
                      ) : null}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
