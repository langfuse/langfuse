import { ModelParameterSettings } from "@/src/components/ModelParameters";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import type { ProjectDefaultModelConfig } from "@/src/features/evals/v2/types/ProjectDefaultModelConfig";

export function JudgeModelConfigurationDialog({
  open,
  projectId,
  initialModel,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  projectId: string;
  initialModel: ProjectDefaultModelConfig;
  onOpenChange: (open: boolean) => void;
  onSave: (model: ProjectDefaultModelConfig) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <JudgeModelConfigurationDialogContent
          key={`${initialModel.provider}:${initialModel.model}`}
          projectId={projectId}
          initialModel={initialModel}
          onCancel={() => onOpenChange(false)}
          onSave={(model) => {
            onSave(model);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function JudgeModelConfigurationDialogContent({
  projectId,
  initialModel,
  onCancel,
  onSave,
}: {
  projectId: string;
  initialModel: ProjectDefaultModelConfig;
  onCancel: () => void;
  onSave: (model: ProjectDefaultModelConfig) => void;
}) {
  const { modelParams, updateModelParamValue, setModelParamEnabled } =
    useModelParams(undefined, {
      initialModel: {
        provider: initialModel.provider,
        adapter: initialModel.adapter,
        model: initialModel.model,
        ...initialModel.modelParams,
      },
    });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Model configuration</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="flex items-center gap-4 border-b pb-4 text-sm">
          <span className="text-muted-foreground w-24 shrink-0">Model</span>
          <span className="font-mono">
            {initialModel.provider} / {initialModel.model}
          </span>
        </div>
        <ModelParameterSettings
          projectId={projectId}
          modelParams={modelParams}
          updateModelParamValue={updateModelParamValue}
          setModelParamEnabled={setModelParamEnabled}
          formDisabled={false}
        />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            const { provider, adapter, model, ...modelConfig } =
              getFinalModelParams(modelParams);
            onSave({ provider, adapter, model, modelParams: modelConfig });
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
