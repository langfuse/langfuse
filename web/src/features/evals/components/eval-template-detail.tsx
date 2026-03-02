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
import { Callout } from "@/src/components/ui/callout";
import Link from "next/link";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import {
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
} from "@/src/components/ui/side-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";

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
      isUserManaged: template.data?.projectId !== null,
    },
    {
      enabled:
        !template.isPending &&
        !template.isError &&
        template.data?.name !== undefined,
    },
  );

  const handleTemplateSelect = (newTemplate: EvalTemplate) => {
    // Update URL without full page reload
    router.push(
      `/project/${projectId}/evals/templates/${newTemplate.id}`,
      undefined,
      { shallow: true },
    );
  };

  const statusReason = template.data?.statusReason as
    | { code: string; description: string }
    | null
    | undefined;

  return (
    <Page
      headerProps={{
        title: `${template.data?.name ?? ""}`,
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
              isCustom={!!template.data?.projectId}
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
              enabled={!template.isPending}
            /> */}
          </>
        ),
      }}
    >
      {allTemplates.isLoading || !allTemplates.data || !template.data ? (
        <div className="p-3">Loading...</div>
      ) : isEditing ? (
        <div className="overflow-y-auto p-3 pt-1">
          <EvalTemplateForm
            useDialog={false}
            projectId={projectId}
            existingEvalTemplate={template.data}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden contain-layout">
          <div className="flex max-h-full min-h-0 flex-col overflow-y-auto px-3 pt-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <MaintainerTooltip maintainer={getMaintainer(template.data)} />
              {template.data.effectiveStatus === "ERROR" && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="warning" className="w-fit text-xs">
                      Paused
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{statusReason?.description}</p>
                    <Link
                      href={`/project/${projectId}/evals/templates/${template.data.id}`}
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Fix in evaluator template
                    </Link>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {template.data.effectiveStatus === "ERROR" && (
              <div className="mb-3">
                <Callout id="eval-template-detail-error" variant="warning">
                  <p className="font-medium">Evaluator paused</p>
                  <p className="mb-2 mt-1">{statusReason?.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {statusReason?.code === "LLM_401"
                      ? "Fix your LLM connection in Project Settings, then edit and save this template."
                      : "Use the Edit button to select a valid model, or update the default evaluation model in Project Settings."}
                  </p>
                  {statusReason?.code === "LLM_401" && (
                    <Link
                      href={`/project/${projectId}/settings/llm-connections`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Go to Project Settings → LLM Connections
                    </Link>
                  )}
                </Callout>
              </div>
            )}
            <EvalTemplateForm
              useDialog={false}
              projectId={projectId}
              existingEvalTemplate={template.data}
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
                        template.id === templateId ? "bg-accent" : ""
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
