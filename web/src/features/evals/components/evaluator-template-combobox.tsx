import { type EvalTemplate } from "@langfuse/shared";
import { useMemo } from "react";
import {
  Combobox,
  type ComboboxOptionGroup,
} from "@/src/components/ui/combobox";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { useSingleTemplateValidation } from "@/src/features/evals/hooks/useSingleTemplateValidation";
import { shouldShowEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";

type EvaluatorTemplateComboboxProps = {
  projectId: string;
  evalTemplates: EvalTemplate[];
  selectedTemplateId?: string;
  onTemplateSelect: (templateId: string) => void;
  disabled?: boolean;
};

function groupLatestTemplatesByName(templates: EvalTemplate[]) {
  const grouped = templates.reduce(
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

  const latestByName = (entries: Record<string, EvalTemplate[]>) =>
    Object.entries(entries)
      .map(([name, versions]) => {
        const sorted = [...versions].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
        return [name, sorted[sorted.length - 1]!] as const;
      })
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

  return {
    custom: latestByName(grouped.custom),
    langfuse: latestByName(grouped.langfuse),
  };
}

export function EvaluatorTemplateCombobox({
  projectId,
  evalTemplates,
  selectedTemplateId,
  onTemplateSelect,
  disabled = false,
}: EvaluatorTemplateComboboxProps) {
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();
  const { isTemplateInvalid } = useSingleTemplateValidation({ projectId });

  const visibleTemplates = useMemo(
    () =>
      evalTemplates.filter((template) =>
        shouldShowEvalTemplate(template, isCodeEvalEnabled),
      ),
    [evalTemplates, isCodeEvalEnabled],
  );

  const grouped = useMemo(
    () => groupLatestTemplatesByName(visibleTemplates),
    [visibleTemplates],
  );

  const options = useMemo((): ComboboxOptionGroup<string>[] => {
    const toOption = ([name, template]: readonly [string, EvalTemplate]) => ({
      value: template.id,
      label: name,
      disabled: isTemplateInvalid(template),
    });

    const groups: ComboboxOptionGroup<string>[] = [];

    if (grouped.custom.length > 0) {
      groups.push({
        heading: "Custom evaluators",
        options: grouped.custom.map(toOption),
      });
    }
    if (grouped.langfuse.length > 0) {
      groups.push({
        heading: "Langfuse evaluators",
        options: grouped.langfuse.map(toOption),
      });
    }

    return groups;
  }, [grouped, isTemplateInvalid]);

  return (
    <Combobox
      options={options}
      value={selectedTemplateId}
      onValueChange={onTemplateSelect}
      placeholder="Select evaluator..."
      searchPlaceholder="Search evaluator name..."
      emptyText="No matching evaluator."
      disabled={disabled || options.length === 0}
      className="h-9 text-sm"
      name="clone-referenced-evaluator"
      commandListClassName="max-h-64"
    />
  );
}
