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
import { useState, type MouseEvent } from "react";
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
import { env } from "@/src/env.mjs";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { shouldShowEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";
import { getEvalTemplateFamilyKey } from "@/src/features/evals/utils/eval-template-family";

type TemplateSelectorProps = {
  projectId: string;
  datasetId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  onConfigureTemplate?: (templateId: string) => void;
  onSelectEvaluator?: (templateId: string) => void;
  className?: string;
};

export const TemplateSelector = ({
  projectId,
  datasetId,
  evalTemplates,
  onConfigureTemplate,
  onSelectEvaluator,
  className,
  disabled = false,
}: TemplateSelectorProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const visibleEvalTemplates = evalTemplates.filter((template) =>
    shouldShowEvalTemplate(template, codeEvalCapabilities),
  );
  const {
    existingEvaluators,
    isTemplateActive,
    isTemplateInactive,
    handleRowClick,
  } = useExperimentEvaluatorSelection({
    projectId: projectId,
    datasetId: datasetId,
    onSelectEvaluator,
  });
  const activeEvaluators = Object.values(existingEvaluators).filter(
    (evaluator) => evaluator.isActive,
  );

  // Validation for templates requiring default model
  const { isTemplateValid, hasDefaultModel } = useTemplatesValidation({
    projectId: projectId,
    selectedTemplateIds: activeEvaluators.map(
      (evaluator) => evaluator.evalTemplateId,
    ),
  });

  // latestTemplates already returns one row per evaluator family.
  const groupedTemplates = visibleEvalTemplates.reduce(
    (acc, template) => {
      const group = template.projectId ? "custom" : "langfuse";
      acc[group][getEvalTemplateFamilyKey(template)] = template;
      return acc;
    },
    {
      langfuse: {} as Record<string, EvalTemplate>,
      custom: {} as Record<string, EvalTemplate>,
    },
  );

  // Filter templates based on search
  const filteredTemplates = {
    langfuse: Object.entries(groupedTemplates.langfuse)
      .filter(([, template]) =>
        template.name.toLowerCase().includes(search.toLowerCase()),
      )
      .sort(([, templateA], [, templateB]) => {
        // Get partners
        const partnerA = templateA.partner;
        const partnerB = templateB.partner;

        // No partner comes before partner
        if (!partnerA && partnerB) return -1;
        if (partnerA && !partnerB) return 1;

        // Sort by name within each group
        return templateA.name.localeCompare(templateB.name);
      }),
    custom: Object.entries(groupedTemplates.custom)
      .filter(([, template]) =>
        template.name.toLowerCase().includes(search.toLowerCase()),
      )
      .sort(([, a], [, b]) => a.name.localeCompare(b.name)),
  };

  const hasResults =
    filteredTemplates.langfuse.length > 0 ||
    filteredTemplates.custom.length > 0;

  // Handle cog button click - configure template
  const handleConfigureTemplate = (e: MouseEvent, templateId: string) => {
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

  const triggerLabel =
    activeEvaluators.length > 0
      ? `${activeEvaluators.length} active evaluators`
      : "Select evaluators";

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
              <span className="mr-1 truncate" title={triggerLabel}>
                {triggerLabel}
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
              className="overflow-y-auto focus:outline-hidden"
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
                      {filteredTemplates.custom.map(([familyKey, template]) => {
                        const isActive = isTemplateActive(familyKey);
                        const isInactive = isTemplateInactive(familyKey);
                        const isInvalid = isTemplateInvalid(template);
                        const isLegacy =
                          existingEvaluators[familyKey]?.targetObject ===
                          "dataset";

                        return (
                          <InputCommandItem
                            key={`custom-${familyKey}`}
                            onSelect={() => {
                              handleRowClick(template.id, familyKey);
                            }}
                            disabled={isInvalid || disabled}
                          >
                            {isActive ? (
                              <CheckIcon className="mr-2 h-4 w-4" />
                            ) : (
                              <div className="mr-2 h-4 w-4" />
                            )}
                            {template.name}
                            {isLegacy && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                legacy
                              </Badge>
                            )}
                            {isInvalid && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                                </TooltipTrigger>
                                <TooltipContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
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
                                className="text-muted-foreground ml-2 text-xs"
                              >
                                Paused
                              </div>
                            )}
                            {isActive && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={(e) =>
                                  handleConfigureTemplate(
                                    e,
                                    existingEvaluators[familyKey]
                                      ?.evalTemplateId ?? template.id,
                                  )
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
                    {filteredTemplates.langfuse.map(([familyKey, template]) => {
                      const isActive = isTemplateActive(familyKey);
                      const isInactive = isTemplateInactive(familyKey);
                      const isInvalid = isTemplateInvalid(template);
                      const isLegacy =
                        existingEvaluators[familyKey]?.targetObject ===
                        "dataset";

                      return (
                        <InputCommandItem
                          key={`langfuse-${familyKey}`}
                          onSelect={() => {
                            handleRowClick(template.id, familyKey);
                          }}
                          disabled={isInvalid || disabled}
                        >
                          {isActive ? (
                            <CheckIcon className="mr-2 h-4 w-4" />
                          ) : (
                            <div className="mr-2 h-4 w-4" />
                          )}
                          <div className="mr-1">{template.name}</div>
                          <MaintainerTooltip
                            maintainer={getMaintainer(template)}
                          />
                          {isLegacy && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              legacy
                            </Badge>
                          )}
                          {isInvalid && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
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
                              className="text-muted-foreground ml-2 text-xs"
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
                                handleConfigureTemplate(
                                  e,
                                  existingEvaluators[familyKey]
                                    ?.evalTemplateId ?? template.id,
                                )
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
                        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/evals/templates/new`,
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
                          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/evals/default-model`,
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
