import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  type EvalTemplate,
} from "@langfuse/shared";
import { AlertCircle, CheckIcon } from "lucide-react";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useSingleTemplateValidation } from "@/src/features/evals/hooks/useSingleTemplateValidation";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import Link from "next/link";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { shouldShowEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";
import { SiPython, SiTypescript } from "react-icons/si";

const CodeTemplateLanguageIcon = ({
  sourceCodeLanguage,
}: {
  sourceCodeLanguage: EvalTemplate["sourceCodeLanguage"];
}) => {
  const language =
    sourceCodeLanguage === EvalTemplateSourceCodeLanguage.TYPESCRIPT
      ? { Icon: SiTypescript, title: "TypeScript" }
      : sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
        ? { Icon: SiPython, title: "Python" }
        : null;

  if (!language) return null;

  const { Icon } = language;

  return (
    <span
      title={language.title}
      aria-label={language.title}
      className="text-muted-foreground ml-1 inline-flex shrink-0"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
};

const getCodeTemplateLanguageTitle = (
  sourceCodeLanguage: EvalTemplate["sourceCodeLanguage"],
) =>
  sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
    ? "Python"
    : sourceCodeLanguage === EvalTemplateSourceCodeLanguage.TYPESCRIPT
      ? "TypeScript"
      : "Code";

const TemplatePreviewTooltipContent = ({
  template,
}: {
  template: EvalTemplate;
}) => {
  if (template.type === EvalTemplateType.CODE) {
    return (
      <>
        <p className="mb-1 font-bold">
          {getCodeTemplateLanguageTitle(template.sourceCodeLanguage)} source
        </p>
        <pre className="text-muted-foreground text-xs wrap-break-word whitespace-pre-wrap">
          {template.sourceCode}
        </pre>
      </>
    );
  }

  return (
    <>
      <p className="mb-1 font-bold">Evaluation prompt</p>
      <pre className="text-muted-foreground text-xs wrap-break-word whitespace-pre-wrap">
        {template.prompt}
      </pre>
    </>
  );
};

interface EvaluatorSelectorProps {
  projectId: string;
  evalTemplates: EvalTemplate[];
  selectedTemplateId?: string;
  showMissingProviderWarning?: boolean;
  onTemplateSelect: (
    templateId: string,
    name: string,
    version?: number,
  ) => void;
}

export function EvaluatorSelector({
  projectId,
  evalTemplates,
  selectedTemplateId,
  showMissingProviderWarning = true,
  onTemplateSelect,
}: EvaluatorSelectorProps) {
  const [search, setSearch] = useState("");
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const visibleEvalTemplates = evalTemplates.filter((template) =>
    shouldShowEvalTemplate(template, codeEvalCapabilities),
  );

  // latestTemplates already returns one row per evaluator family.
  const matchesSearch = (template: EvalTemplate) =>
    template.name.toLowerCase().includes(search.toLowerCase());
  const filteredTemplates = {
    langfuse: visibleEvalTemplates
      .filter((template) => !template.projectId && matchesSearch(template))
      .sort((templateA, templateB) => {
        // No partner comes before partner
        if (!templateA.partner && templateB.partner) return -1;
        if (templateA.partner && !templateB.partner) return 1;

        return templateA.name.localeCompare(templateB.name);
      }),
    custom: visibleEvalTemplates
      .filter((template) => template.projectId && matchesSearch(template))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  // Check if we have results
  const hasResults =
    filteredTemplates.langfuse.length > 0 ||
    filteredTemplates.custom.length > 0;
  const { isTemplateInvalid } = useSingleTemplateValidation({
    projectId,
    enabled: showMissingProviderWarning,
  });

  return (
    <InputCommand className="flex h-full flex-col border-none">
      <InputCommandInput
        placeholder="Search evaluators..."
        className="h-9 px-0"
        value={search}
        onValueChange={setSearch}
        variant="bottom"
      />
      <InputCommandList className="max-h-full flex-1 overflow-y-auto">
        {!hasResults && (
          <InputCommandEmpty>No evaluator found.</InputCommandEmpty>
        )}

        {filteredTemplates.custom.length > 0 && (
          <>
            <InputCommandGroup heading="Custom evaluators">
              {filteredTemplates.custom.map((template) => {
                const isInvalid = isTemplateInvalid(template);

                return (
                  <InputCommandItem
                    key={`custom-${template.id}`}
                    disabled={isInvalid}
                    onSelect={() => {
                      onTemplateSelect(
                        template.id,
                        template.name,
                        template.version,
                      );
                    }}
                    className={cn(
                      template.id === selectedTemplateId && "bg-secondary",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex min-w-0 items-center">
                          <span className="truncate" title={template.name}>
                            {template.name}
                          </span>
                          {template.type === EvalTemplateType.CODE ? (
                            <CodeTemplateLanguageIcon
                              sourceCodeLanguage={template.sourceCodeLanguage}
                            />
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="max-h-[70dvh] w-[720px] max-w-[calc(100vw-3rem)] overflow-y-auto"
                      >
                        <TemplatePreviewTooltipContent template={template} />
                      </TooltipContent>
                    </Tooltip>
                    {isInvalid && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-h-[50dvh] overflow-y-auto text-sm break-normal whitespace-normal">
                          <p>Requires project-level evaluation model</p>
                          <Link
                            href={`/project/${projectId}/evals/default-model`}
                            className="mt-2 block text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Configure default model
                          </Link>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {template.id === selectedTemplateId && (
                      <CheckIcon className="ml-auto h-4 w-4" />
                    )}
                  </InputCommandItem>
                );
              })}
            </InputCommandGroup>
            {filteredTemplates.custom.length > 0 && <InputCommandSeparator />}
          </>
        )}

        {filteredTemplates.langfuse.length > 0 && (
          <>
            <InputCommandGroup heading="Langfuse managed evaluators">
              {filteredTemplates.langfuse.map((template) => {
                const isInvalid = isTemplateInvalid(template);

                return (
                  <InputCommandItem
                    key={`langfuse-${template.id}`}
                    disabled={isInvalid}
                    onSelect={() => {
                      onTemplateSelect(
                        template.id,
                        template.name,
                        template.version,
                      );
                    }}
                    className={cn(
                      template.id === selectedTemplateId && "bg-secondary",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mr-1 flex min-w-0 items-center">
                          <span className="truncate" title={template.name}>
                            {template.name}
                          </span>
                          {template.type === EvalTemplateType.CODE ? (
                            <CodeTemplateLanguageIcon
                              sourceCodeLanguage={template.sourceCodeLanguage}
                            />
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="max-h-[70dvh] w-[720px] max-w-[calc(100vw-3rem)] overflow-y-auto"
                      >
                        <TemplatePreviewTooltipContent template={template} />
                      </TooltipContent>
                    </Tooltip>
                    <MaintainerTooltip maintainer={getMaintainer(template)} />
                    {isInvalid && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-h-[50dvh] overflow-y-auto text-sm break-normal whitespace-normal">
                          <p>Requires project-level evaluation model</p>
                          <Link
                            href={`/project/${projectId}/evals/default-model`}
                            className="mt-2 block text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Configure default model
                          </Link>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {template.id === selectedTemplateId && (
                      <CheckIcon className="ml-auto h-4 w-4" />
                    )}
                  </InputCommandItem>
                );
              })}
            </InputCommandGroup>
          </>
        )}
      </InputCommandList>
    </InputCommand>
  );
}
