import * as React from "react";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { api } from "@/src/utils/api";
import { type EvalTemplate } from "@langfuse/shared";
import { useRouter } from "next/router";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";

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
    <Page
      withPadding
      scrollable
      headerProps={{
        title: `${template.data?.name}: ${templateId}`,
        itemType: "EVAL_TEMPLATE",
        breadcrumb: [
          {
            name: "Eval Templates",
            href: `/project/${router.query.projectId as string}/evals/templates`,
          },
        ],
        actionButtonsRight: (
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
        ),
      }}
    >
      {allTemplates.isLoading || !allTemplates.data ? (
        <div className="p-3">Loading...</div>
      ) : (
        <EvalTemplateForm
          projectId={projectId}
          existingEvalTemplate={template.data ?? undefined}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
        />
      )}
    </Page>
  );
};

export function EvalVersionDropdown(props: {
  disabled: boolean;
  options?: EvalTemplate[];
  defaultOption?: EvalTemplate;
  onSelect?: (template: EvalTemplate) => void;
}) {
  const capture = usePostHogClientCapture();
  const handleSelect = (value: string) => {
    const selectedTemplate = props.options?.find(
      (template) => template.id === value,
    );
    if (selectedTemplate && props.onSelect) {
      props.onSelect(selectedTemplate);
      capture("eval_templates:view_version");
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
              v{template.version} - {template.createdAt.toLocaleDateString()}
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
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:create",
  });
  const capture = usePostHogClientCapture();

  const handlePromptEdit = () => {
    setIsEditing(true);
    capture("eval_templates:update_form_open");
  };

  return (
    <Button
      variant="outline"
      onClick={() => handlePromptEdit()}
      disabled={!hasAccess}
      loading={isLoading}
    >
      <Plus className="h-4 w-4" />
      New version
    </Button>
  );
}
