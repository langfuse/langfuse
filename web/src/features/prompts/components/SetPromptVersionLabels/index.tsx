import React, { useEffect, useState, useRef, type ReactNode } from "react";
import { CircleFadingArrowUp } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
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
import {
  PRODUCTION_LABEL,
  PromptLabelSchema,
  type Prompt,
} from "@langfuse/shared";
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
  const [createdLabels, setCreatedLabels] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const labelsChanged =
    JSON.stringify([...selectedLabels].sort()) !==
    JSON.stringify([...prompt.labels].sort());
  const customLabelScrollRef = useRef<HTMLDivElement | null>(null);
  const previousIsOpenRef = useRef(false);
  const previousPromptIdRef = useRef(prompt.id);

  const usedLabelsInProject = api.prompts.allLabels.useQuery(
    {
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  useEffect(() => {
    const justOpened = isOpen && !previousIsOpenRef.current;
    const promptChangedWhileOpen =
      isOpen && previousPromptIdRef.current !== prompt.id;

    if (justOpened || promptChangedWhileOpen) {
      setSelectedLabels(prompt.labels);
      setCreatedLabels([]);
      setSearchValue("");
    }

    previousIsOpenRef.current = isOpen;
    previousPromptIdRef.current = prompt.id;
  }, [isOpen, prompt.id, prompt.labels]);

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

  // Derived label lists
  const labels = [
    ...new Set([
      ...prompt.labels,
      ...(usedLabelsInProject.data ?? []),
      ...createdLabels,
    ]),
  ];
  const customLabels = labels.filter((l) => !isReservedPromptLabel(l));
  const normalizedSearchValue = searchValue.toLowerCase().trim();
  const filteredCustomLabels = customLabels.filter((l) =>
    l.toLowerCase().includes(normalizedSearchValue),
  );
  const filteredCustomLabelSet = new Set(filteredCustomLabels);
  const filteredUnselectedCount = filteredCustomLabels.filter(
    (l) => !selectedLabels.includes(l),
  ).length;
  const hasFilteredSelection = filteredCustomLabels.some((l) =>
    selectedLabels.includes(l),
  );

  // Validate new label creation from search input
  const trimmedSearch = searchValue.trim();
  const isValidNewLabel =
    trimmedSearch.length > 0 &&
    !isReservedPromptLabel(trimmedSearch) &&
    PromptLabelSchema.safeParse(trimmedSearch).success &&
    !labels.includes(trimmedSearch);
  const noExactMatch =
    trimmedSearch.length > 0 && !labels.includes(trimmedSearch);

  const handleCreateLabel = () => {
    if (!isValidNewLabel) return;
    setCreatedLabels((prev) => [...prev, trimmedSearch]);
    setSelectedLabels((prev) => [...new Set([...prev, trimmedSearch])]);
    capture("prompt_detail:add_label_submit");
    setSearchValue("");
    setTimeout(
      () =>
        customLabelScrollRef.current?.scrollTo({
          top: customLabelScrollRef.current?.scrollHeight,
          behavior: "smooth",
        }),
      0,
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOnOpenChange} modal={false}>
      <PopoverTrigger asChild data-version-trigger="true">
        <div
          className={cn(
            "flex w-fit max-w-full min-w-0 cursor-pointer flex-wrap gap-1",
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
            title="Add prompt label"
            className={cn(
              "bg-muted-gray text-primary h-6 w-6",
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
          <h2 className="text-md mb-3 font-semibold">Prompt labels</h2>
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
                {/* Search + create input */}
                <div className="px-2 pt-1 pb-2">
                  <Input
                    placeholder="Search or create label…"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateLabel();
                    }}
                    className="h-7 text-sm"
                  />
                </div>

                {/* Select all N / Clear links */}
                {customLabels.length > 0 && (
                  <div className="flex items-center gap-3 px-2 pb-1">
                    <button
                      type="button"
                      className={cn(
                        "text-primary text-xs underline-offset-2 hover:underline",
                        filteredUnselectedCount === 0 &&
                          "text-muted-foreground cursor-default no-underline opacity-50",
                      )}
                      disabled={filteredUnselectedCount === 0}
                      onClick={() =>
                        setSelectedLabels((prev) => [
                          ...new Set([...prev, ...filteredCustomLabels]),
                        ])
                      }
                    >
                      {filteredUnselectedCount > 0
                        ? `Select all ${filteredUnselectedCount}`
                        : "Select all"}
                    </button>
                    <span className="text-muted-foreground text-xs">·</span>
                    <button
                      type="button"
                      className={cn(
                        "text-primary text-xs underline-offset-2 hover:underline",
                        !hasFilteredSelection &&
                          "text-muted-foreground cursor-default no-underline opacity-50",
                      )}
                      disabled={!hasFilteredSelection}
                      onClick={() =>
                        setSelectedLabels((prev) =>
                          prev.filter(
                            (l) =>
                              isReservedPromptLabel(l) ||
                              !filteredCustomLabelSet.has(l),
                          ),
                        )
                      }
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Filtered label list */}
                <div
                  className="max-h-[240px] overflow-x-hidden overflow-y-auto"
                  ref={customLabelScrollRef}
                >
                  {filteredCustomLabels.map((label) => (
                    <LabelCommandItem
                      key={label}
                      {...{ selectedLabels, setSelectedLabels, label }}
                    />
                  ))}

                  {/* Create new label option */}
                  {noExactMatch && (
                    <button
                      type="button"
                      className={cn(
                        "text-muted-foreground flex w-full items-center px-2 py-1.5 text-left text-sm",
                        isValidNewLabel
                          ? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          : "cursor-default opacity-50",
                      )}
                      disabled={!isValidNewLabel}
                      onClick={handleCreateLabel}
                    >
                      <span className="truncate">
                        Create a new label:{" "}
                        <strong className="text-foreground">
                          {trimmedSearch}
                        </strong>
                      </span>
                    </button>
                  )}
                </div>
              </InputCommandGroup>
            </InputCommandList>
          </InputCommand>
          <Button
            type="button"
            variant={
              isPromotingToProduction || isDemotingFromProduction
                ? "destructive"
                : "default"
            }
            loading={mutatePromptVersionLabels.isPending}
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
