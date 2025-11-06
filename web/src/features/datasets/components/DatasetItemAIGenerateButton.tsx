import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Check,
  ExternalLink,
} from "lucide-react";
import { api } from "@/src/utils/api";
import { usePostHog } from "posthog-js/react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type DatasetItemAIGenerateButtonProps = {
  fieldType: "input" | "expectedOutput";
  currentValue: string;
  otherFieldValue: string;
  datasetId: string;
  projectId: string;
  isPolishing?: boolean;
  onAccept: (value: string) => void;
};

export const DatasetItemAIGenerateButton: React.FC<
  DatasetItemAIGenerateButtonProps
> = ({
  fieldType,
  currentValue,
  otherFieldValue,
  datasetId,
  projectId,
  isPolishing = false,
  onAccept,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [generatedValue, setGeneratedValue] = useState<string | null>(null);
  const posthog = usePostHog();
  const { organization } = useQueryProject();

  const hasAdminAccess = useHasOrganizationAccess({
    organizationId: organization?.id ?? undefined,
    scope: "organization:update",
  });

  const isAIEnabled = organization?.aiFeaturesEnabled ?? false;

  const generateMutation =
    api.datasets.generateSyntheticItemField.useMutation();

  const handleGenerate = async () => {
    setIsOpen(true);
    setGeneratedValue(null);

    posthog.capture("dataset_item:ai_generate_click", {
      projectId,
      datasetId,
      fieldType,
      isPolishing,
    });

    try {
      const result = await generateMutation.mutateAsync({
        projectId,
        datasetId,
        fieldType,
        currentInput: fieldType === "input" ? currentValue : otherFieldValue,
        currentExpectedOutput:
          fieldType === "expectedOutput" ? currentValue : otherFieldValue,
        isPolishing,
      });

      setGeneratedValue(result.generatedValue);

      posthog.capture("dataset_item:ai_generate_success", {
        projectId,
        datasetId,
        fieldType,
        isPolishing,
      });
    } catch (error) {
      trpcErrorToast(error);
      setIsOpen(false);

      posthog.capture("dataset_item:ai_generate_error", {
        projectId,
        datasetId,
        fieldType,
        isPolishing,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleAccept = () => {
    if (generatedValue) {
      onAccept(generatedValue);
      setIsOpen(false);
      setGeneratedValue(null);

      posthog.capture("dataset_item:ai_generate_accept", {
        projectId,
        datasetId,
        fieldType,
        isPolishing,
      });
    }
  };

  const handleRegenerate = () => {
    posthog.capture("dataset_item:ai_generate_regenerate", {
      projectId,
      datasetId,
      fieldType,
      isPolishing,
    });
    handleGenerate();
  };

  const handleCancel = () => {
    setIsOpen(false);
    setGeneratedValue(null);

    posthog.capture("dataset_item:ai_generate_cancel", {
      projectId,
      datasetId,
      fieldType,
      isPolishing,
    });
  };

  const buttonContent = (
    <Button
      variant="outline"
      size="sm"
      disabled={!isAIEnabled}
      onClick={isAIEnabled ? handleGenerate : undefined}
      className="ml-auto"
      type="button"
    >
      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
      {isPolishing ? "Polish with AI" : "Generate with AI"}
    </Button>
  );

  // If AI is disabled, show tooltip with message to enable it
  if (!isAIEnabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="space-y-2">
              <p className="text-sm">
                AI features are not enabled for this organization.
              </p>
              {hasAdminAccess && organization?.id ? (
                <Button
                  onClick={() => {
                    window.open(
                      `/organization/${organization.id}/settings`,
                      "_blank",
                    );
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Enable in Organization Settings
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ask your organization administrator to enable AI features in
                  organization settings.
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
      <PopoverContent className="w-[600px]" align="end">
        {generateMutation.isPending ? (
          <div className="flex items-center gap-2 p-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm font-medium">Generating...</p>
          </div>
        ) : generatedValue ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">
                Generated {fieldType === "input" ? "Input" : "Expected Output"}
              </p>
              <div className="max-h-[400px] overflow-auto rounded border">
                <CodeMirrorEditor
                  mode="json"
                  value={generatedValue}
                  onChange={() => {}}
                  minHeight="none"
                  editable={false}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel} type="button">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                type="button"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button onClick={handleAccept} type="button">
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Accept
              </Button>
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
