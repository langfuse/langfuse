import { type EvalTemplate } from "@langfuse/shared";
import { AlertCircle, CheckIcon, ExternalLink } from "lucide-react";
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

interface EvaluatorSelectorProps {
  projectId: string;
  evalTemplates: EvalTemplate[];
  selectedTemplateId?: string;
  onTemplateSelect: (
    templateId: string,
    name: string,
    version?: number,
  ) => void;
  onCreateNew?: () => void;
}

export function EvaluatorSelector({
  projectId,
  evalTemplates,
  selectedTemplateId,
  onTemplateSelect,
  onCreateNew,
}: EvaluatorSelectorProps) {
  const [search, setSearch] = useState("");

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

  // Check if we have results
  const hasResults =
    filteredTemplates.langfuse.length > 0 ||
    filteredTemplates.custom.length > 0;

  const { isTemplateInvalid } = useSingleTemplateValidation({
    projectId,
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
                      "group",
                      templateData.some((t) => t.id === selectedTemplateId) &&
                        "bg-secondary",
                    )}
                  >
                    {name}
                    {isInvalid && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Requires project-level evaluation model
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {templateData.some((t) => t.id === selectedTemplateId) ? (
                      <>
                        <Link
                          href={`/project/${projectId}/evals/templates/${latestVersion.id}`}
                          target="_blank"
                          className="ml-auto opacity-0 hover:opacity-100 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <CheckIcon className={cn("ml-2 h-4 w-4")} />
                      </>
                    ) : (
                      <Link
                        href={`/project/${projectId}/evals/templates/${latestVersion.id}`}
                        target="_blank"
                        className="ml-auto opacity-0 hover:opacity-100 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
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
                      "group",
                      templateData.some((t) => t.id === selectedTemplateId) &&
                        "bg-secondary",
                    )}
                  >
                    <div className="mr-1">{name}</div>
                    <MaintainerTooltip
                      maintainer={getMaintainer(latestVersion)}
                    />
                    {isInvalid && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertCircle className="ml-1 h-4 w-4 text-yellow-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Requires project-level evaluation model
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {templateData.some((t) => t.id === selectedTemplateId) ? (
                      <>
                        <Link
                          href={`/project/${projectId}/evals/templates/${latestVersion.id}`}
                          target="_blank"
                          className="ml-auto opacity-0 hover:opacity-100 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        <CheckIcon className={cn("ml-2 h-4 w-4")} />
                      </>
                    ) : (
                      <Link
                        href={`/project/${projectId}/evals/templates/${latestVersion.id}`}
                        target="_blank"
                        className="ml-auto opacity-0 hover:opacity-100 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </InputCommandItem>
                );
              })}
            </InputCommandGroup>
          </>
        )}

        {onCreateNew && (
          <>
            <InputCommandSeparator alwaysRender />
            <InputCommandGroup forceMount>
              <InputCommandItem onSelect={onCreateNew}>
                Create custom evaluator
                <ExternalLink className="ml-auto h-4 w-4" />
              </InputCommandItem>
            </InputCommandGroup>
          </>
        )}
      </InputCommandList>
    </InputCommand>
  );
}
