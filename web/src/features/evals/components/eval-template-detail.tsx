import * as React from "react";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
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
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import { Switch } from "@/src/components/ui/switch";
import { Command } from "@/src/components/ui/command";
import { Badge } from "@/src/components/ui/badge";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";

export const EvalTemplateDetail = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const templateId = router.query.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EvalTemplate | null>(
    null,
  );

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
      isUserManaged: template.data?.projectId !== null,
    },
    {
      enabled:
        !template.isLoading &&
        !template.isError &&
        template.data?.name !== undefined,
    },
  );

  // Set the selected template when data is loaded
  React.useEffect(() => {
    if (template.data && !selectedTemplate) {
      setSelectedTemplate(template.data);
    }
  }, [template.data, selectedTemplate]);

  const handleTemplateSelect = (newTemplate: EvalTemplate) => {
    setSelectedTemplate(newTemplate);
    // Update URL without full page reload
    router.push(
      `/project/${projectId}/evals/templates/${newTemplate.id}`,
      undefined,
      { shallow: true },
    );
  };

  // Get the appropriate template to display
  const displayTemplate = selectedTemplate || template.data;

  return (
    <Page
      headerProps={{
        title: `${displayTemplate?.name || ""}`,
        itemType: "EVALUATOR",
        breadcrumb: [
          {
            name: "Evaluator Library",
            href: `/project/${router.query.projectId as string}/evals/templates`,
          },
        ],
        actionButtonsRight: (
          <>
            <UpdateTemplate
              projectId={projectId}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              isCustom={!!displayTemplate?.projectId}
            />

            {/* TODO: moved to LFE-4573 */}
            {/* <DeleteEvaluatorTemplateButton
              itemId={templateId}
              projectId={projectId}
              redirectUrl={`/project/${projectId}/evals/templates`}
              deleteConfirmation={
                template.data != null
                  ? `${template.data.name}-v${template.data.version}`
                  : undefined
              }
              enabled={!template.isLoading}
            /> */}
          </>
        ),
      }}
    >
      {allTemplates.isLoading || !allTemplates.data || !displayTemplate ? (
        <div className="p-3">Loading...</div>
      ) : isEditing ? (
        <div className="overflow-y-auto p-3 pt-1">
          <EvalTemplateForm
            useDialog={false}
            projectId={projectId}
            existingEvalTemplate={displayTemplate}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden contain-layout">
          <div className="flex max-h-full min-h-0 flex-col overflow-y-auto px-3 pt-1">
            <EvalTemplateForm
              useDialog={false}
              projectId={projectId}
              existingEvalTemplate={displayTemplate}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
            />
          </div>
          <SidePanel mobileTitle="Change history" id="change-history">
            <SidePanelHeader>
              <SidePanelTitle className="text-base font-semibold">
                Change history
              </SidePanelTitle>
            </SidePanelHeader>
            <SidePanelContent>
              <Command className="flex flex-col gap-2 overflow-y-auto rounded-none font-medium focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[focus]:ring-0">
                <div className="flex flex-col overflow-y-auto">
                  {allTemplates.data.templates.map((template, index) => (
                    <div
                      key={template.id}
                      className={`flex cursor-pointer flex-col rounded-md px-2 py-1.5 hover:bg-accent ${
                        template.id === displayTemplate.id ? "bg-accent" : ""
                      }`}
                      onClick={() => handleTemplateSelect(template)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Badge
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            variant="outline"
                            className="h-6 shrink-0 bg-background/50"
                            data-version-trigger="false"
                          >
                            # {template.version}
                          </Badge>
                          {index === 0 && (
                            <StatusBadge
                              type="active"
                              key="active"
                              className="break-all sm:break-normal"
                            />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {template.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Command>
            </SidePanelContent>
          </SidePanel>
        </div>
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
  isEditing,
  setIsEditing,
  isCustom,
}: {
  projectId: string;
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
  isCustom: boolean;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:CUD",
  });
  const capture = usePostHogClientCapture();

  const handlePromptEdit = (checked: boolean) => {
    setIsEditing(checked);
    if (checked) capture("eval_templates:update_form_open");
  };

  if (!isCustom) {
    return (
      <div className="flex items-center gap-2">
        <LangfuseIcon size={16} />
        <span className="text-sm font-medium text-muted-foreground">
          View only
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Edit mode</span>
      <Switch
        checked={isEditing}
        onCheckedChange={handlePromptEdit}
        disabled={!hasAccess}
      />
    </div>
  );
}
