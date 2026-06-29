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
        <p className="mb-1 font-medium">
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
      <p className="mb-1 font-medium">Evaluation prompt</p>
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

  // Group templates by name and whether they are managed by Langfuse
  const groupedTemplates = visibleEvalTemplates.reduce(
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

  // Ensure per-name arrays are sorted by createdAt ascending so last is latest
  const sortByCreatedAt = (arr: EvalTemplate[]) =>
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  Object.values(groupedTemplates.custom).forEach(sortByCreatedAt);
  Object.values(groupedTemplates.langfuse).forEach(sortByCreatedAt);

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
              {filteredTemplates.custom.map(([name, templateData]) => {
                const latestVersion = templateData[templateData.length - 1];
                const isInvalid = isTemplateInvalid(latestVersion);

                return (
                  <InputCommandItem
                    key={`custom-${name}`}
                    disabled={isInvalid}
                    onSelect={() => {
                      onTemplateSelect(
                        latestVersion.id,
                        name,
                        latestVersion.version,
                      );
                    }}
                    className={cn(
                      templateData.some((t) => t.id === selectedTemplateId) &&
                        "bg-secondary",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex min-w-0 items-center">
                          <span className="truncate">{name}</span>
                          {latestVersion.type === EvalTemplateType.CODE ? (
                            <CodeTemplateLanguageIcon
                              sourceCodeLanguage={
                                latestVersion.sourceCodeLanguage
                              }
                            />
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="max-h-[70dvh] w-[720px] max-w-[calc(100vw-3rem)] overflow-y-auto"
                      >
                        <TemplatePreviewTooltipContent
                          template={latestVersion}
                        />
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
                    {templateData.some((t) => t.id === selectedTemplateId) && (
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
              {filteredTemplates.langfuse.map(([name, templateData]) => {
                const latestVersion = templateData[templateData.length - 1];
                const isInvalid = isTemplateInvalid(latestVersion);

                return (
                  <InputCommandItem
                    key={`langfuse-${name}`}
                    disabled={isInvalid}
                    onSelect={() => {
                      onTemplateSelect(
                        latestVersion.id,
                        name,
                        latestVersion.version,
                      );
                    }}
                    className={cn(
                      templateData.some((t) => t.id === selectedTemplateId) &&
                        "bg-secondary",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mr-1 flex min-w-0 items-center">
                          <span className="truncate">{name}</span>
                          {latestVersion.type === EvalTemplateType.CODE ? (
                            <CodeTemplateLanguageIcon
                              sourceCodeLanguage={
                                latestVersion.sourceCodeLanguage
                              }
                            />
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="max-h-[70dvh] w-[720px] max-w-[calc(100vw-3rem)] overflow-y-auto"
                      >
                        <TemplatePreviewTooltipContent
                          template={latestVersion}
                        />
                      </TooltipContent>
                    </Tooltip>
                    <MaintainerTooltip
                      maintainer={getMaintainer(latestVersion)}
                    />
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
                    {templateData.some((t) => t.id === selectedTemplateId) && (
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
