import React, { useEffect, useState, useRef } from "react";

import { PlusIcon, TagIcon } from "lucide-react";

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
import { type Prompt } from "@langfuse/shared";
import { AddLabelForm } from "./AddLabelForm";
import { LabelCommandItem } from "./LabelCommandItem";
import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { isReservedPromptLabel } from "@/src/features/prompts/utils";

export function SetPromptVersionLabels({
  prompt,
  isOpen,
  setIsOpen,
}: {
  prompt: Prompt;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [isAddingLabel, setIsAddingLabel] = useState(false);
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
  };

  return (
    <Popover
      key={prompt.id}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        setIsAddingLabel(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 px-0"
          aria-label="Set prompt labels"
          title="Set prompt labels"
          disabled={!hasAccess}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <TagIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div onClick={(event) => event.stopPropagation()}>
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
