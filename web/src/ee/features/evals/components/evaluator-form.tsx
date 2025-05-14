import { Button } from "@/src/components/ui/button";
import { type JobConfiguration } from "@langfuse/shared";
import { useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@langfuse/shared";
import { CheckIcon, ChevronDown, ExternalLink } from "lucide-react";
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
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { InnerEvaluatorForm } from "@/src/ee/features/evals/components/inner-evaluator-form";

export const TemplateSelector = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  mode?: "create" | "edit";
  selectedTemplateName?: string;
  selectedTemplateVersion?: number;
  onTemplateSelect: (templateId: string, name: string, version: number) => void;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const utils = api.useUtils();

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

  // Check if we have results
  const hasResults =
    filteredTemplates.langfuse.length > 0 ||
    filteredTemplates.custom.length > 0;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            disabled={props.disabled || props.mode === "edit"}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("justify-between px-2 font-normal", props.className)}
          >
            {props.selectedTemplateName || "Select an evaluator"}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] overflow-auto p-0"
          align="start"
        >
          <InputCommand>
            <InputCommandInput
              placeholder="Search evaluators..."
              className="h-9"
              value={search}
              onValueChange={setSearch}
            />
            <InputCommandList>
              {!hasResults && (
                <InputCommandEmpty>No evaluator found.</InputCommandEmpty>
              )}

              {filteredTemplates.langfuse.length > 0 && (
                <>
                  <InputCommandGroup heading="Langfuse managed evaluators">
                    {filteredTemplates.langfuse.map(([name, templateData]) => (
                      <InputCommandItem
                        key={`langfuse-${name}`}
                        onSelect={() => {
                          const latestVersion =
                            templateData[templateData.length - 1];
                          props.onTemplateSelect(
                            latestVersion.id,
                            name,
                            latestVersion.version,
                          );
                          setOpen(false);
                        }}
                      >
                        {name}
                        <CheckIcon
                          className={cn(
                            "ml-auto h-4 w-4",
                            name === props.selectedTemplateName
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                      </InputCommandItem>
                    ))}
                  </InputCommandGroup>
                  {filteredTemplates.custom.length > 0 && (
                    <InputCommandSeparator />
                  )}
                </>
              )}

              {filteredTemplates.custom.length > 0 && (
                <InputCommandGroup heading="Custom evaluators">
                  {filteredTemplates.custom.map(([name, templateData]) => (
                    <InputCommandItem
                      key={`custom-${name}`}
                      onSelect={() => {
                        const latestVersion =
                          templateData[templateData.length - 1];
                        props.onTemplateSelect(
                          latestVersion.id,
                          name,
                          latestVersion.version,
                        );
                        setOpen(false);
                      }}
                    >
                      {name}
                      <CheckIcon
                        className={cn(
                          "ml-auto h-4 w-4",
                          name === props.selectedTemplateName
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </InputCommandItem>
                  ))}
                </InputCommandGroup>
              )}

              <InputCommandSeparator alwaysRender />
              <InputCommandGroup forceMount>
                <InputCommandItem
                  onSelect={() => {
                    setIsCreateTemplateOpen(true);
                    setOpen(false);
                  }}
                >
                  Create custom evaluator
                  <ExternalLink className="ml-auto h-4 w-4" />
                </InputCommandItem>
              </InputCommandGroup>
            </InputCommandList>
          </InputCommand>
        </PopoverContent>
      </Popover>

      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
          <DialogTitle>Create new evaluator</DialogTitle>
          <EvalTemplateForm
            projectId={props.projectId}
            preventRedirect={true}
            isEditing={true}
            onFormSuccess={() => {
              setIsCreateTemplateOpen(false);
              void utils.evals.allTemplates.invalidate();
              showSuccessToast({
                title: "Evaluator created successfully",
                description: "You can now use this evaluator.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export const EvaluatorForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvaluator?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
  templateId?: string;
}) => {
  const [evalTemplate, setEvalTemplate] = useState<string | undefined>(
    props.existingEvaluator?.evalTemplate.id || props.templateId,
  );

  const currentTemplate = props.evalTemplates.find(
    (t) => t.id === evalTemplate,
  );

  useEffect(() => {
    if (props.templateId && !evalTemplate) {
      setEvalTemplate(props.templateId);
    } else if (props.existingEvaluator?.evalTemplate && !evalTemplate) {
      setEvalTemplate(props.existingEvaluator.evalTemplate.id);
    }
  }, [
    props.existingEvaluator,
    props.templateId,
    evalTemplate,
    props.evalTemplates,
  ]);

  const selectedTemplate =
    props.templateId && currentTemplate ? (
      <div className="mb-4 rounded-md border border-border bg-muted/50 p-4">
        <h3 className="mb-1 text-sm font-medium">Selected Evaluator</h3>
        <p className="text-sm text-muted-foreground">{currentTemplate.name}</p>
      </div>
    ) : null;

  return (
    <>
      {selectedTemplate}
      {evalTemplate && currentTemplate ? (
        <InnerEvaluatorForm
          key={evalTemplate}
          projectId={props.projectId}
          disabled={props.disabled}
          existingEvaluator={props.existingEvaluator}
          evalTemplate={
            props.existingEvaluator?.evalTemplate ?? currentTemplate
          }
          onFormSuccess={props.onFormSuccess}
          shouldWrapVariables={props.shouldWrapVariables}
          mode={props.mode}
        />
      ) : null}
    </>
  );
};
