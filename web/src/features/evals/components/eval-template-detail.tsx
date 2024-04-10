import * as React from "react";
import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/features/evals/components/new-template-form";
import { PlaygroundProvider } from "@/src/features/playground/client/context";
import { api } from "@/src/utils/api";
import { EvalTemplate, evalModels } from "@langfuse/shared";
import { useRouter } from "next/router";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
export const EvalTemplateDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const templateId = router.query.id as string;

  console.log("templateId", templateId);

  const evals = api.evals.allTemplates.useQuery({
    projectId: projectId,
    id: templateId,
  });

  const allTemplates = api.evals.allTemplatesByName.useQuery(
    {
      projectId: projectId,
      name:
        evals.data && evals.data?.templates.length > 0
          ? evals.data?.templates[0].name
          : "",
    },
    {
      enabled: evals.data !== undefined && evals.data?.templates.length > 0,
    },
  );

  return (
    <div className="md:container">
      <Header
        title="Create eval template"
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
        actionButtons={
          <EvalVersionDropdown
            disabled={allTemplates.isLoading}
            options={allTemplates.data?.templates ?? []}
            onSelect={(template) => {
              router.push(
                `/project/${projectId}/evals/templates/${template.id}`,
              );
            }}
          />
        }
      />
      {allTemplates.isLoading || !allTemplates.data ? (
        <div>Loading...</div>
      ) : (
        <PlaygroundProvider avilableModels={[...evalModels]}>
          <EvalTemplateForm
            projectId={projectId}
            existingEvalTemplate={
              evals.data?.templates && evals.data?.templates.length > 0
                ? evals.data?.templates[0]
                : undefined
            }
          />
        </PlaygroundProvider>
      )}
    </div>
  );
};

export function EvalVersionDropdown(props: {
  disabled: boolean;
  options?: EvalTemplate[];
  onSelect?: (template: EvalTemplate) => void;
}) {
  const handleSelect = (value: string) => {
    const selectedTemplate = props.options?.find(
      (template) => template.id === value,
    );
    if (selectedTemplate && props.onSelect) {
      props.onSelect(selectedTemplate);
    }
  };

  return (
    <Select disabled={props.disabled} onValueChange={handleSelect}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Version" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {props.options?.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.version} - {template.createdAt.toLocaleDateString()}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
