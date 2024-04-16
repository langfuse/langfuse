import * as React from "react";
import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { PlaygroundProvider } from "@/src/features/playground/client/context";
import { api } from "@/src/utils/api";
import { type EvalTemplate, evalLLMModels } from "@langfuse/shared";
import { useRouter } from "next/router";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Button } from "@/src/components/ui/button";
import { Pencil } from "lucide-react";
import { useState } from "react";

export const EvalTemplateDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const templateId = router.query.id as string;

  const [isEditing, setIsEditing] = useState(false);

  // get the current template by id
  const template = api.evals.templateById.useQuery({
    projectId: projectId,
    id: templateId,
  });

  // get all templates for the current template name
  const allTemplates = api.evals.allTemplatesForName.useQuery(
    {
      projectId: projectId,
      name: template.data?.name ?? "",
    },
    {
      enabled:
        !template.isLoading &&
        !template.isError &&
        template.data?.name !== undefined,
    },
  );

  return (
    <div className="md:container">
      <Header
        title={template.data?.name ?? "Loading..."}
        actionButtons={
          template.data && (
            <>
              {!isEditing && (
                <UpdateTemplate
                  projectId={projectId}
                  isLoading={template.isLoading}
                  setIsEditing={setIsEditing}
                />
              )}
              <EvalVersionDropdown
                disabled={allTemplates.isLoading}
                options={allTemplates.data?.templates ?? []}
                defaultOption={template.data ?? undefined}
                onSelect={(template) => {
                  router.push(
                    `/project/${projectId}/evals/templates/${template.id}`,
                  );
                }}
              />
            </>
          )
        }
      />
      {allTemplates.isLoading || !allTemplates.data ? (
        <div>Loading...</div>
      ) : (
        <PlaygroundProvider avilableModels={[...evalLLMModels]}>
          <EvalTemplateForm
            projectId={projectId}
            existingEvalTemplate={template.data ?? undefined}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
        </PlaygroundProvider>
      )}
    </div>
  );
};

export function EvalVersionDropdown(props: {
  disabled: boolean;
  options?: EvalTemplate[];
  defaultOption?: EvalTemplate;
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
    <Select
      disabled={props.disabled}
      onValueChange={handleSelect}
      defaultValue={props.defaultOption ? props.defaultOption.id : undefined}
    >
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

export function UpdateTemplate({
  projectId,
  isLoading,
  setIsEditing,
}: {
  projectId: string;
  isLoading: boolean;
  setIsEditing: (isEditing: boolean) => void;
}) {
  const hasAccess = useHasAccess({ projectId, scope: "evalTemplate:create" });

  const handlePromptEdit = () => {
    setIsEditing(true);
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => handlePromptEdit()}
      disabled={!hasAccess}
      loading={isLoading}
    >
      <Pencil className="h-5 w-5" />
    </Button>
  );
}
