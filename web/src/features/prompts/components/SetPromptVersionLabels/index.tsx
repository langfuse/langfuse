import React, { useEffect, useState } from "react";

import { FlagIcon, PlusIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type Prompt } from "@langfuse/shared";
import { AddLabelForm } from "./AddLabelForm";
import { LabelCommandItem } from "./LabelCommandItem";

export function SetPromptVersionLabels({ prompt }: { prompt: Prompt }) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const posthog = usePostHog();
  const hasAccess = useHasAccess({ projectId, scope: "prompts:CUD" });

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingLabel, setIsAddingLabel] = useState(false);

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
    !prompt.labels.includes("production") &&
    selectedLabels.includes("production");

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

    posthog.capture("prompt:setLabels", { labels: selectedLabels });
    setIsOpen(false);
  };

  if (!hasAccess) return null;

  return (
    <Popover
      key={prompt.id}
      open={isOpen}
      onOpenChange={() => {
        setIsOpen(!isOpen);
        setIsAddingLabel(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Set prompt labels"
          title="Set prompt labels"
        >
          <FlagIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Prompt version labels</h2>
        <h2 className="mb-3 text-xs">
          Use labels to fetch prompts via SDKs. The <strong>production</strong>{" "}
          labeled prompt will be served by default.
        </h2>
        <Command className="mx-0 my-3 px-0">
          <CommandList>
            <CommandSeparator />
            <CommandGroup heading="Promote to production?">
              <LabelCommandItem
                {...{ selectedLabels, setSelectedLabels, label: "production" }}
              />
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Custom labels">
              {labels
                .filter((l) => l !== "production")
                .map((label) => (
                  <LabelCommandItem
                    key={label}
                    {...{ selectedLabels, setSelectedLabels, label }}
                  />
                ))}
            </CommandGroup>

            <div className="px-1">
              {isAddingLabel ? (
                <AddLabelForm {...{ setLabels, setSelectedLabels }} />
              ) : (
                <Button
                  variant="ghost"
                  className="mt-2 w-full justify-start px-2 py-1 text-sm  font-normal"
                  onClick={() => setIsAddingLabel(true)}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add custom label
                </Button>
              )}
            </div>
          </CommandList>
        </Command>
        <Button
          type="button"
          variant={isPromotingToProduction ? "destructive" : "default"}
          loading={mutatePromptVersionLabels.isLoading}
          className="w-full"
          onClick={handleSubmitLabels}
        >
          {isPromotingToProduction ? "Save and promote to production" : "Save"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
