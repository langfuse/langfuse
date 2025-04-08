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

export const EvaluatorForm = (props: {
  projectId: string;
  evalTemplates: EvalTemplate[];
  disabled?: boolean;
  existingEvaluator?: JobConfiguration & { evalTemplate: EvalTemplate };
  onFormSuccess?: () => void;
  mode?: "create" | "edit";
  shouldWrapVariables?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [evalTemplate, setEvalTemplate] = useState<string | undefined>(
    props.existingEvaluator?.evalTemplate.id,
  );
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | undefined
  >(props.existingEvaluator?.evalTemplate.name);
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<
    number | undefined
  >(props.existingEvaluator?.evalTemplate.version);

  const utils = api.useUtils();
  const currentTemplate = props.evalTemplates.find(
    (t) => t.id === evalTemplate,
  );

  useEffect(() => {
    if (props.existingEvaluator?.evalTemplate && !evalTemplate) {
      setEvalTemplate(props.existingEvaluator.evalTemplate.id);
    }
  }, [props.existingEvaluator, evalTemplate]);

  // Group templates by name
  const templatesByName = props.evalTemplates.reduce(
    (acc, template) => {
      if (!acc[template.name]) {
        acc[template.name] = [];
      }
      acc[template.name].push(template);
      return acc;
    },
    {} as Record<string, EvalTemplate[]>,
  );

  return (
    <>
      {!props.disabled ? (
        <div className="mb-2 flex gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={props.disabled || props.mode === "edit"}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-2/3 justify-between px-2 font-normal"
              >
                {selectedTemplateName || "Select a template"}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] overflow-auto p-0"
              align="start"
            >
              <InputCommand>
                <InputCommandInput
                  placeholder="Search templates..."
                  className="h-9"
                />
                <InputCommandList>
                  <InputCommandEmpty>No template found.</InputCommandEmpty>
                  <InputCommandGroup>
                    {Object.entries(templatesByName).map(
                      ([name, templateData]) => (
                        <InputCommandItem
                          key={name}
                          onSelect={() => {
                            setSelectedTemplateName(name);
                            const latestVersion =
                              templateData[templateData.length - 1];
                            setSelectedTemplateVersion(latestVersion.version);
                            setEvalTemplate(latestVersion.id);
                          }}
                        >
                          {name}
                          <CheckIcon
                            className={cn(
                              "ml-auto h-4 w-4",
                              name === selectedTemplateName
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </InputCommandItem>
                      ),
                    )}
                  </InputCommandGroup>
                  <InputCommandSeparator alwaysRender />
                  <InputCommandGroup forceMount>
                    <InputCommandItem
                      onSelect={() => setIsCreateTemplateOpen(true)}
                    >
                      Create new template
                      <ExternalLink className="ml-auto h-4 w-4" />
                    </InputCommandItem>
                  </InputCommandGroup>
                </InputCommandList>
              </InputCommand>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                disabled={
                  props.disabled ||
                  !selectedTemplateName ||
                  props.mode === "edit"
                }
                variant="outline"
                role="combobox"
                className="w-1/3 justify-between px-2 font-normal"
              >
                {selectedTemplateVersion
                  ? `Version ${selectedTemplateVersion}`
                  : "Version"}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] overflow-auto p-0"
              align="start"
            >
              <InputCommand>
                <InputCommandList>
                  <InputCommandEmpty>No version found.</InputCommandEmpty>
                  <InputCommandGroup>
                    {selectedTemplateName &&
                    templatesByName[selectedTemplateName] ? (
                      templatesByName[selectedTemplateName].map((template) => (
                        <InputCommandItem
                          key={template.id}
                          onSelect={() => {
                            setSelectedTemplateVersion(template.version);
                            setEvalTemplate(template.id);
                          }}
                        >
                          Version {template.version}
                          <CheckIcon
                            className={cn(
                              "ml-auto h-4 w-4",
                              template.version === selectedTemplateVersion
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                        </InputCommandItem>
                      ))
                    ) : (
                      <InputCommandItem disabled>
                        No versions available
                      </InputCommandItem>
                    )}
                  </InputCommandGroup>
                </InputCommandList>
              </InputCommand>
            </PopoverContent>
          </Popover>
        </div>
      ) : undefined}
      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
          <DialogTitle>Create new template</DialogTitle>
          <EvalTemplateForm
            projectId={props.projectId}
            preventRedirect={true}
            isEditing={true}
            onFormSuccess={() => {
              setIsCreateTemplateOpen(false);
              void utils.evals.allTemplates.invalidate();
              showSuccessToast({
                title: "Template created successfully",
                description:
                  "You can now use this template in a new eval config.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
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
