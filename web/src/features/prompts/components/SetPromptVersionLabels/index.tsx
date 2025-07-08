import React, { useEffect, useState, useRef, type ReactNode } from "react";
import { CircleFadingArrowUp, PlusIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandGroup,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { PRODUCTION_LABEL, type Prompt } from "@langfuse/shared";
import { AddLabelForm } from "./AddLabelForm";
import { LabelCommandItem } from "./LabelCommandItem";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { isReservedPromptLabel } from "@/src/features/prompts/utils";
import { TruncatedLabels } from "@/src/components/TruncatedLabels";
import { cn } from "@/src/utils/tailwind";

export function SetPromptVersionLabels({
  promptLabels,
  prompt,
  isOpen,
  setIsOpen,
  title,
  showOnlyOnHover = false,
  maxVisibleLabels = 8,
}: {
  promptLabels: string[];
  prompt: Prompt;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  title?: ReactNode;
  showOnlyOnHover?: boolean;
  maxVisibleLabels?: number;
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const labelsChanged =
    JSON.stringify([...selectedLabels].sort()) !==
    JSON.stringify([...prompt.labels].sort());
  const customLabelScrollRef = useRef<HTMLDivElement | null>(null);

  const usedLabelsInProject = api.prompts.allLabels.useQuery(
    {
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
    },
    { enabled: Boolean(projectId) },
  );

  // Set initial labels and selected labels
  useEffect(() => {
    if (isOpen) {
      setLabels([
        ...new Set([...prompt.labels, ...(usedLabelsInProject.data ?? [])]),
      ]);
      setSelectedLabels(prompt.labels);
    }
  }, [isOpen, prompt.labels, usedLabelsInProject.data]);

  const isPromotingToProduction =
    !prompt.labels.includes(PRODUCTION_LABEL) &&
    selectedLabels.includes(PRODUCTION_LABEL);

  const isDemotingFromProduction =
    prompt.labels.includes(PRODUCTION_LABEL) &&
    !selectedLabels.includes(PRODUCTION_LABEL);

  const mutatePromptVersionLabels = api.prompts.setLabels.useMutation({
    onSuccess: () => {
      void utils.prompts.invalidate();
    },
  });

  const handleSubmitLabels = async () => {
    try {
      if (!projectId) {
        alert("Project ID is missing");
        return;
      }

      await mutatePromptVersionLabels.mutateAsync({
        projectId: projectId as string,
        promptId: prompt.id,
        labels: selectedLabels,
      });

      capture("prompt_detail:apply_labels", { labels: selectedLabels });
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOnOpenChange = (open: boolean) => {
    if (!hasAccess) setIsOpen(false);
    else setIsOpen(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOnOpenChange} modal={false}>
      <PopoverTrigger asChild data-version-trigger="true">
        <div
          className={cn(
            "flex w-fit min-w-0 max-w-full cursor-pointer flex-wrap gap-1",
            !hasAccess && "cursor-not-allowed",
          )}
        >
          {title && title}
          <TruncatedLabels
            labels={promptLabels}
            maxVisibleLabels={maxVisibleLabels}
          />
          <Button
            variant="outline"
            title="Add prompt version label"
            className={cn(
              "h-6 w-6 bg-muted-gray text-primary",
              showOnlyOnHover && "opacity-0 group-hover:opacity-100",
              !hasAccess && "cursor-not-allowed group-hover:opacity-50",
            )}
          >
            <CircleFadingArrowUp className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-[90vw] sm:max-w-md"
        align="start"
        side="bottom"
        sideOffset={5}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="flex flex-col"
        >
          <h2 className="text-md mb-3 font-semibold">Prompt version labels</h2>
          <h2 className="mb-3 text-xs">
            Use labels to fetch prompts via SDKs. The{" "}
            <strong>production</strong> labeled prompt will be served by
            default.
          </h2>
          <InputCommand className="mx-0 my-3 px-0">
            <InputCommandList className="max-h-full overflow-hidden">
              <InputCommandSeparator />
              <InputCommandGroup heading="Promote to production?">
                <LabelCommandItem
                  {...{
                    selectedLabels,
                    setSelectedLabels,
                    label: PRODUCTION_LABEL,
                  }}
                />
              </InputCommandGroup>
              <InputCommandSeparator />
              <InputCommandGroup heading="Custom labels">
                <div
                  className="max-h-[300px] overflow-y-auto overflow-x-hidden"
                  ref={customLabelScrollRef}
                >
                  {labels
                    .filter((l) => !isReservedPromptLabel(l))
                    .map((label) => (
                      <LabelCommandItem
                        key={label}
                        {...{ selectedLabels, setSelectedLabels, label }}
                      />
                    ))}
                </div>
              </InputCommandGroup>
            </InputCommandList>
            <div className="px-1">
              {isAddingLabel ? (
                <AddLabelForm
                  {...{
                    setLabels,
                    setSelectedLabels,
                    onAddLabel: () => {
                      setTimeout(
                        () =>
                          customLabelScrollRef.current?.scrollTo({
                            top: customLabelScrollRef.current?.scrollHeight,
                            behavior: "smooth",
                          }),
                        0,
                      );
                    },
                  }}
                />
              ) : (
                <Button
                  variant="ghost"
                  className="mt-2 w-full justify-start px-2 py-1 text-sm font-normal"
                  onClick={() => setIsAddingLabel(true)}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add custom label
                </Button>
              )}
            </div>
          </InputCommand>
          <Button
            type="button"
            variant={
              isPromotingToProduction || isDemotingFromProduction
                ? "destructive"
                : "default"
            }
            loading={mutatePromptVersionLabels.isLoading}
            disabled={!labelsChanged}
            className="w-full"
            onClick={handleSubmitLabels}
          >
            {isPromotingToProduction
              ? "Save and promote to production"
              : isDemotingFromProduction
                ? "Save and remove from production"
                : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
