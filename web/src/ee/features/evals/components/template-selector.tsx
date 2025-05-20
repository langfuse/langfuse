import { type EvalTemplate } from "@langfuse/shared";

import { CheckIcon, ChevronDown, Cog, ExternalLink, X } from "lucide-react";
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
import { useImperativeHandle, forwardRef, useState } from "react";
import { useExperimentEvaluatorSelection } from "@/src/ee/features/experiments/hooks/useExperimentEvaluatorSelection";

// Define a ref interface for external control of the component
export interface TemplateSelectorRef {
  getPendingTemplate: () => string | null;
  confirmPendingSelection: () => void;
  clearPendingSelection: () => void;
}

export const TemplateSelector = forwardRef<
  TemplateSelectorRef,
  {
    projectId: string;
    datasetId: string;
    evalTemplates: EvalTemplate[];
    disabled?: boolean;
    mode?: "create" | "edit";
    activeTemplateIds?: string[];
    inactiveTemplateIds?: string[];
    onTemplateSelect: (templateId: string) => void;
    onConfigureTemplate?: (templateId: string) => void;
    onPendingTemplateSelect?: (templateId: string) => void;
    className?: string;
    multiSelect?: boolean;
  }
>((props, ref) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const {
    pendingTemplate,
    activeTemplates,
    imperativeMethods,
    isTemplateActive,
    isTemplateInactive,
    isTemplatePending,
    handleRowClick,
    isLoading,
  } = useExperimentEvaluatorSelection({
    projectId: props.projectId,
    datasetId: props.datasetId,
    initialActiveTemplateIds: props.activeTemplateIds,
    initialInactiveTemplateIds: props.inactiveTemplateIds,
    multiSelect: props.multiSelect,
    onTemplateSelect: props.onTemplateSelect,
    onPendingTemplateSelect: props.onPendingTemplateSelect,
  });

  // Expose methods to the parent component via ref
  useImperativeHandle(ref, () => imperativeMethods);

  // Group templates by name and whether they are managed by Langfuse
  const groupedTemplates = props.evalTemplates.reduce(
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
      .sort(([a], [b]) => a.localeCompare(b)),
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
    if (props.onConfigureTemplate) {
      props.onConfigureTemplate(templateId);
    }
  };

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            disabled={props.disabled || props.mode === "edit"}
            variant="outline"
            role="combobox"
            aria-expanded={isPopoverOpen}
            className={cn(
              "w-full justify-between px-2 font-normal",
              props.className,
            )}
          >
            <div className="flex items-center gap-1 overflow-hidden">
              <span className="mr-1 truncate">
                {activeTemplates.length > 0
                  ? `${activeTemplates.length} evaluators selected`
                  : pendingTemplate
                    ? "1 evaluator pending confirmation"
                    : "Select evaluators"}
              </span>
              {pendingTemplate && (
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
              )}
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

                {filteredTemplates.langfuse.length > 0 && (
                  <>
                    <InputCommandGroup
                      heading="Langfuse managed evaluators"
                      className="max-h-full min-h-0"
                    >
                      {filteredTemplates.langfuse.map(
                        ([name, templateData]) => {
                          const latestTemplate =
                            templateData[templateData.length - 1];
                          const isActive = isTemplateActive(latestTemplate.id);
                          const isPending = isTemplatePending(
                            latestTemplate.id,
                          );
                          const isInactive = isTemplateInactive(
                            latestTemplate.id,
                          );

                          return (
                            <InputCommandItem
                              key={`langfuse-${name}`}
                              onSelect={() => {
                                handleRowClick(latestTemplate.id);
                              }}
                              className={
                                isPending ? "bg-amber-50 dark:bg-amber-950" : ""
                              }
                            >
                              {isActive ? (
                                <CheckIcon className="mr-2 h-4 w-4" />
                              ) : isPending ? (
                                <div className="mr-2 h-4 w-4 rounded-full border-2 border-amber-500" />
                              ) : (
                                <div className="mr-2 h-4 w-4" />
                              )}
                              {name}
                              {(isInactive || isPending) && (
                                <div
                                  title={
                                    isInactive
                                      ? "Configured to run by default on datasets for this experiment. Skipped for this run"
                                      : "Pending confirmation"
                                  }
                                  className="ml-2 text-xs text-muted-foreground"
                                >
                                  {isInactive ? "Default" : "Pending"}
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
                                      latestTemplate.id,
                                    )
                                  }
                                  title="Configure evaluator"
                                >
                                  <Cog className="h-4 w-4" />
                                </Button>
                              )}
                            </InputCommandItem>
                          );
                        },
                      )}
                    </InputCommandGroup>
                    {filteredTemplates.custom.length > 0 && (
                      <InputCommandSeparator />
                    )}
                  </>
                )}

                {filteredTemplates.custom.length > 0 && (
                  <InputCommandGroup
                    heading="Custom evaluators"
                    className="max-h-full"
                  >
                    {filteredTemplates.custom.map(([name, templateData]) => {
                      const latestTemplate =
                        templateData[templateData.length - 1];
                      const isActive = isTemplateActive(latestTemplate.id);
                      const isPending = isTemplatePending(latestTemplate.id);
                      const isInactive = isTemplateInactive(latestTemplate.id);

                      return (
                        <InputCommandItem
                          key={`custom-${name}`}
                          onSelect={() => {
                            handleRowClick(latestTemplate.id);
                          }}
                          className={
                            isPending ? "bg-amber-50 dark:bg-amber-950" : ""
                          }
                        >
                          {isActive ? (
                            <CheckIcon className="mr-2 h-4 w-4" />
                          ) : isPending ? (
                            <div className="mr-2 h-4 w-4 rounded-full border-2 border-amber-500" />
                          ) : (
                            <div className="mr-2 h-4 w-4" />
                          )}
                          {name}
                          {(isInactive || isPending) && (
                            <div
                              title={
                                isInactive
                                  ? "Configured to run by default on datasets for this experiment. Skipped for this run"
                                  : "Pending confirmation"
                              }
                              className="ml-2 text-xs text-muted-foreground"
                            >
                              {isInactive ? "Default" : "Pending"}
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
                              title="Configure evaluator"
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
                      // TODO: open link to create new evaluator
                    }}
                  >
                    Create custom evaluator
                    <ExternalLink className="ml-auto h-4 w-4" />
                  </InputCommandItem>
                </InputCommandGroup>
              </InputCommandList>
            </div>
          </InputCommand>
        </PopoverContent>
      </Popover>
    </>
  );
});

TemplateSelector.displayName = "TemplateSelector";
