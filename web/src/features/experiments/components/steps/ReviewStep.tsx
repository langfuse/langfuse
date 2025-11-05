import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import { type ReviewStepProps } from "@/src/features/experiments/types/stepProps";
import { StepHeader } from "@/src/features/experiments/components/shared/StepHeader";

export const ReviewStep: React.FC<ReviewStepProps> = ({
  formState,
  navigationState,
  summary,
}) => {
  const { form } = formState;
  const { setActiveStep } = navigationState;
  const {
    selectedPromptName,
    selectedPromptVersion,
    selectedDataset,
    modelParams,
    activeEvaluatorNames,
    structuredOutputEnabled,
    selectedSchemaName,
    validationResult,
  } = summary;
  const formValues = form.getValues();

  return (
    <div className="space-y-6">
      <StepHeader
        title="Review & Run"
        description="Review your experiment configuration before running it. You can go back to any step to make changes."
      />

      {/* Two-column grid layout */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {/* Prompt Card - Top Left */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => setActiveStep("prompt")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{selectedPromptName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground">Version:</span>
              <span className="font-medium">v{selectedPromptVersion}</span>
            </div>
          </CardContent>
        </Card>

        {/* Model Card - Top Right */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => setActiveStep("prompt")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Provider:</span>
              <span>{modelParams.provider.value}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground">Model:</span>
              <span>{modelParams.model.value}</span>
            </div>
            {modelParams.temperature.enabled && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">Temperature:</span>
                <span>{modelParams.temperature.value}</span>
              </div>
            )}
            {modelParams.max_tokens.enabled && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">Max Tokens:</span>
                <span>{modelParams.max_tokens.value}</span>
              </div>
            )}
            {structuredOutputEnabled && selectedSchemaName && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">
                  Structured Output:
                </span>
                <span>{selectedSchemaName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dataset Card - Middle Left */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => setActiveStep("dataset")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dataset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{selectedDataset?.name}</span>
            </div>
            {validationResult?.isValid && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">Items:</span>
                <span>{validationResult.totalItems}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evaluators Card - Middle Right (only if there are evaluators) */}
        {activeEvaluatorNames.length > 0 && (
          <Card
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={() => setActiveStep("evaluators")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Evaluators ({activeEvaluatorNames.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {activeEvaluatorNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Run Details Card - Bottom (Full Width) */}
        <Card
          className="cursor-pointer transition-colors hover:bg-accent md:col-span-2"
          onClick={() => setActiveStep("details")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Experiment Run Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Experiment Name:</span>
              <span className="font-medium">{formValues.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Run Name:</span>
              <span className="font-medium">{formValues.runName}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  This run name is auto-generated from the experiment name and
                  can be used to fetch the resulting experiment run via the
                  public API.
                </TooltipContent>
              </Tooltip>
            </div>
            {formValues.description && (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Description:</span>
                <span className="text-sm">{formValues.description}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
