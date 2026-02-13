import { type EvalTemplate } from "@langfuse/shared";

import {
  CheckIcon,
  ChevronDown,
  Cog,
  ExternalLink,
  AlertCircle,
  ExternalLinkIcon,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { useExperimentEvaluatorSelection } from "@/src/features/experiments/hooks/useExperimentEvaluatorSelection";
import { useTemplatesValidation } from "@/src/features/evals/hooks/useTemplatesValidation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useSingleTemplateValidation } from "@/src/features/evals/hooks/useSingleTemplateValidation";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { useIsObservationEvalsBeta } from "@/src/features/events/hooks/useObservationEvals";

type TemplateSelectorProps = {
  projectId: string;
  datasetId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  activeTemplateIds?: string[];
  inactiveTemplateIds?: string[];
  evaluatorTargetObjects?: Record<string, string>;
  onConfigureTemplate?: (templateId: string) => void;
  onSelectEvaluator?: (templateId: string) => void;
  onEvaluatorToggled?: () => void;
  className?: string;
};

export const TemplateSelector = ({
  projectId,
  datasetId,
  evalTemplates,
  activeTemplateIds,
  inactiveTemplateIds,
  evaluatorTargetObjects,
  onConfigureTemplate,
  onSelectEvaluator,
  onEvaluatorToggled,
  className,
  disabled = false,
}: TemplateSelectorProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isBetaEnabled = useIsObservationEvalsBeta();
  const {
    activeTemplates,
    isTemplateActive,
    isTemplateInactive,
    handleRowClick,
  } = useExperimentEvaluatorSelection({
    projectId: projectId,
    datasetId: datasetId,
    initialActiveTemplateIds: activeTemplateIds,
    initialInactiveTemplateIds: inactiveTemplateIds,
    onSelectEvaluator,
    onEvaluatorToggled,
  });

  // Validation for templates requiring default model
  const { isTemplateValid, hasDefaultModel } = useTemplatesValidation({
    projectId: projectId,
    selectedTemplateIds: activeTemplates,
  });

  // Group templates by name and whether they are managed by Langfuse
  const groupedTemplates = evalTemplates.reduce(
    (acc, template) => {
      const group = template.projectId ? "custom" : "langfuse";
      if (!acc[group][template.name]) {
        acc[group][template.name] = [];
      }
      acc[group][template.name].push(template);
      return acc;
    },
    {
      langfuse: {} as Record<string, EvalTemplate[]>,
      custom: {} as Record<string, EvalTemplate[]>,
    },
  );

  // Filter templates based on search
  const filteredTemplates = {
    langfuse: Object.entries(groupedTemplates.langfuse)
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
      .sort(([nameA, templatesA], [nameB, templatesB]) => {
        // Get partners
        const partnerA = templatesA[0]?.partner;
        const partnerB = templatesB[0]?.partner;

        // No partner comes before partner
        if (!partnerA && partnerB) return -1;
        if (partnerA && !partnerB) return 1;

        // Sort by name within each group
        return nameA.localeCompare(nameB);
      }),
    custom: Object.entries(groupedTemplates.custom)
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b)),
  };

  const hasResults =
    filteredTemplates.langfuse.length > 0 ||
    filteredTemplates.custom.length > 0;

  // Handle cog button click - configure template
  const handleConfigureTemplate = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();

    // Check if this template requires a default model
    if (!isTemplateValid(templateId)) {
      // If it requires a default model and none is set, show a warning instead
      return;
    }

    if (onConfigureTemplate) {
      onConfigureTemplate(templateId);
    }
  };

  const { isTemplateInvalid } = useSingleTemplateValidation({
    projectId: projectId,
  });

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isPopoverOpen}
            className={cn("w-full justify-between px-2 font-normal", className)}
          >
            <div className="flex items-center gap-1 overflow-hidden">
              <span className="mr-1 truncate">
                {activeTemplates.length > 0
                  ? `${activeTemplates.length} active evaluators`
                  : "Select evaluators"}
              </span>
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <InputCommand>
            <InputCommandInput
              placeholder="Search evaluators..."
              className="h-9"
              value={search}
              onValueChange={setSearch}
              variant="bottom"
            />
            <div
              tabIndex={0}
              className="overflow-y-auto focus:outline-none"
              style={{ maxHeight: "300px" }}
              onWheel={(e) => {
                // Prevent the wheel event from being captured by parent elements
                e.stopPropagation();
              }}
            >
              <InputCommandList className="max-h-full overflow-visible overflow-x-hidden">
                {!hasResults && (
                  <InputCommandEmpty>No evaluator found.</InputCommandEmpty>
                )}

                {filteredTemplates.custom.length > 0 && (
                  <>
                    <InputCommandGroup
                      heading="Custom evaluators"
                      className="max-h-full"
                    >
                      {filteredTemplates.custom.map(([name, templateData]) => {
                        const latestTemplate =
                          templateData[templateData.length - 1];
                        const isActive = isTemplateActive(latestTemplate.id);
                        const isInactive = isTemplateInactive(
                          latestTemplate.id,
                        );
                        const isInvalid = isTemplateInvalid(latestTemplate);
                        const isLegacy =
                          evaluatorTargetObjects?.[latestTemplate.id] ===
                          "dataset";

                        return (
                          <InputCommandItem
                            key={`custom-${name}`}
                            onSelect={() => {
                              handleRowClick(latestTemplate.id);
                            }}
                            disabled={isInvalid || disabled}
                          >
                            {isActive ? (
                              <CheckIcon className="mr-2 h-4 w-4" />
                            ) : (
                              <div className="mr-2 h-4 w-4" />
                            )}
                            {name}
                            {isBetaEnabled && isLegacy && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                legacy
                              </Badge>
                            )}
                            {isInvalid && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                                </TooltipTrigger>
                                <TooltipContent className="max-h-[50dvh] overflow-y-auto whitespace-normal break-normal text-xs">
                                  <p>Requires project-level evaluation model</p>
                                  <Link
                                    href={`/project/${projectId}/evals/default-model`}
                                    className="mt-2 flex items-center gap-1 text-blue-600 hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLinkIcon className="h-3 w-3" />
                                    Configure default model
                                  </Link>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {isInactive && (
                              <div
                                title="The evaluator has been used in the past but is currently paused. It will not run against outputs created in this dataset run. You can reactivate it if you wish"
                                className="ml-2 text-xs text-muted-foreground"
                              >
                                Paused
                              </div>
                            )}
                            {isActive && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) =>
                                  handleConfigureTemplate(e, latestTemplate.id)
                                }
                                className="ml-auto"
                                title={
                                  isInvalid
                                    ? "Configure default model first"
                                    : "Configure evaluator"
                                }
                                disabled={isInvalid || disabled}
                              >
                                <Cog className="h-4 w-4" />
                              </Button>
                            )}
                          </InputCommandItem>
                        );
                      })}
                    </InputCommandGroup>
                    {filteredTemplates.custom.length > 0 && (
                      <InputCommandSeparator />
                    )}
                  </>
                )}

                {filteredTemplates.langfuse.length > 0 && (
                  <InputCommandGroup
                    heading="Langfuse managed evaluators"
                    className="max-h-full min-h-0"
                  >
                    {filteredTemplates.langfuse.map(([name, templateData]) => {
                      const latestTemplate =
                        templateData[templateData.length - 1];
                      const isActive = isTemplateActive(latestTemplate.id);
                      const isInactive = isTemplateInactive(latestTemplate.id);
                      const isInvalid = isTemplateInvalid(latestTemplate);
                      const isLegacy =
                        evaluatorTargetObjects?.[latestTemplate.id] ===
                        "dataset";

                      return (
                        <InputCommandItem
                          key={`langfuse-${name}`}
                          onSelect={() => {
                            handleRowClick(latestTemplate.id);
                          }}
                          disabled={isInvalid || disabled}
                        >
                          {isActive ? (
                            <CheckIcon className="mr-2 h-4 w-4" />
                          ) : (
                            <div className="mr-2 h-4 w-4" />
                          )}
                          <div className="mr-1">{name}</div>
                          <MaintainerTooltip
                            maintainer={getMaintainer(latestTemplate)}
                          />
                          {isBetaEnabled && isLegacy && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              legacy
                            </Badge>
                          )}
                          {isInvalid && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-h-[50dvh] overflow-y-auto whitespace-normal break-normal text-xs">
                                <p>Requires project-level evaluation model</p>
                                <Link
                                  href={`/project/${projectId}/evals/default-model`}
                                  className="mt-2 flex items-center gap-1 text-blue-600 hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLinkIcon className="h-3 w-3" />
                                  Configure default model
                                </Link>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {isInactive && (
                            <div
                              title="The evaluator has been used in the past but is currently paused. It will not run against outputs created in this dataset run. You can reactivate it if you wish"
                              className="ml-2 text-xs text-muted-foreground"
                            >
                              Paused
                            </div>
                          )}
                          {isActive && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="ml-auto"
                              onClick={(e) =>
                                handleConfigureTemplate(e, latestTemplate.id)
                              }
                              title={
                                isInvalid
                                  ? "Configure default model first"
                                  : "Configure evaluator"
                              }
                              disabled={isInvalid || disabled}
                            >
                              <Cog className="h-4 w-4" />
                            </Button>
                          )}
                        </InputCommandItem>
                      );
                    })}
                  </InputCommandGroup>
                )}

                <InputCommandSeparator alwaysRender />
                <InputCommandGroup forceMount>
                  <InputCommandItem
                    onSelect={() => {
                      if (disabled) return;
                      window.open(
                        `/project/${projectId}/evals/templates/new`,
                        "_blank",
                      );
                    }}
                  >
                    Create custom evaluator
                    <ExternalLink className="ml-auto h-4 w-4" />
                  </InputCommandItem>
                  {!hasDefaultModel && (
                    <InputCommandItem
                      onSelect={() => {
                        if (disabled) return;
                        window.open(
                          `/project/${projectId}/evals/default-model`,
                          "_blank",
                        );
                      }}
                    >
                      Configure default model
                      <ExternalLink className="ml-auto h-4 w-4" />
                    </InputCommandItem>
                  )}
                </InputCommandGroup>
              </InputCommandList>
            </div>
          </InputCommand>
        </PopoverContent>
      </Popover>
    </>
  );
};

TemplateSelector.displayName = "TemplateSelector";
