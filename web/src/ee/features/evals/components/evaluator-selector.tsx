import { type EvalTemplate } from "@langfuse/shared";
import { CheckIcon, ExternalLink } from "lucide-react";
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

interface EvaluatorSelectorProps {
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
    <InputCommand className="flex h-full flex-col border-none">
      <InputCommandInput
        placeholder="Search evaluators..."
        className="h-9 px-0"
        value={search}
        onValueChange={setSearch}
        variant="bottom"
      />
      <InputCommandList className="max-h-full flex-1 overflow-y-auto px-3">
        {!hasResults && (
          <InputCommandEmpty>No evaluator found.</InputCommandEmpty>
        )}

        {filteredTemplates.custom.length > 0 && (
          <InputCommandGroup heading="Custom evaluators">
            {filteredTemplates.custom.map(([name, templateData]) => (
              <InputCommandItem
                key={`custom-${name}`}
                onSelect={() => {
                  const latestVersion = templateData[templateData.length - 1];
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
                {name}
                <CheckIcon
                  className={cn(
                    "ml-auto h-4 w-4",
                    templateData.some((t) => t.id === selectedTemplateId)
                      ? "opacity-100"
                      : "opacity-0",
                  )}
                />
              </InputCommandItem>
            ))}
          </InputCommandGroup>
        )}

        {filteredTemplates.langfuse.length > 0 && (
          <>
            <InputCommandGroup heading="Langfuse managed evaluators">
              {filteredTemplates.langfuse.map(([name, templateData]) => (
                <InputCommandItem
                  key={`langfuse-${name}`}
                  onSelect={() => {
                    const latestVersion = templateData[templateData.length - 1];
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
                  {name}
                  <CheckIcon
                    className={cn(
                      "ml-auto h-4 w-4",
                      templateData.some((t) => t.id === selectedTemplateId)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </InputCommandItem>
              ))}
            </InputCommandGroup>
            {filteredTemplates.custom.length > 0 && <InputCommandSeparator />}
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
