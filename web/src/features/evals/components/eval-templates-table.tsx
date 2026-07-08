import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type CustomHeights } from "@/src/components/table/data-table-row-height-switch";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { createColumnHelper } from "@tanstack/react-table";
import { Copy, MoreVertical, Pen, Trash } from "lucide-react";
import { useQueryParam, StringParam, withDefault } from "use-query-params";
import { useEffect, useMemo, useState } from "react";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import TableIdOrName from "@/src/components/table/table-id";
import { TablePeekViewEvaluatorTemplateDetail } from "@/src/components/table/peek/peek-evaluator-template-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { Button } from "@/src/components/ui/button";
import { useRouter } from "next/router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DeleteEvalTemplateDialog } from "@/src/features/evals/components/delete-eval-template-dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type RouterInput } from "@/src/utils/types";
import {
  type TemplateValidationInput,
  useSingleTemplateValidation,
} from "@/src/features/evals/hooks/useSingleTemplateValidation";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { ActionButton } from "@/src/components/ActionButton";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Badge } from "@/src/components/ui/badge";
import { getTemplateResultType } from "@/src/features/evals/utils/template-output";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  type EvalTemplate,
} from "@langfuse/shared";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import {
  CODE_EVAL_ESCAPE_CONFIRM_MESSAGE,
  shouldShowEvalTemplate,
} from "@/src/features/evals/utils/code-eval-template-utils";
import { SiPython, SiTypescript } from "react-icons/si";

export type EvalsTemplateRow = {
  name: string;
  resultType: string;
  maintainer: string;
  latestCreatedAt?: Date;
  latestVersion?: number;
  id?: string;
  usageCount?: number;
  actions?: string;
} & TemplateValidationInput;

type CloneCreateTemplateInput = Extract<
  RouterInput["evals"]["createTemplate"],
  { intent: "clone" }
>;

const getMaintainerLabel = (maintainer: string) =>
  maintainer.replace(/ maintained$/, "");

const getCodeEvalLanguageLabel = (
  sourceCodeLanguage?: EvalTemplate["sourceCodeLanguage"],
) =>
  sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
    ? "Python"
    : sourceCodeLanguage === EvalTemplateSourceCodeLanguage.TYPESCRIPT
      ? "TypeScript"
      : "Code";

const TemplateTypeBadge = ({
  type,
  sourceCodeLanguage,
}: {
  type?: EvalTemplateType;
  sourceCodeLanguage?: EvalTemplate["sourceCodeLanguage"];
}) => {
  if (type === EvalTemplateType.CODE) {
    const label = getCodeEvalLanguageLabel(sourceCodeLanguage);
    const Icon =
      sourceCodeLanguage === EvalTemplateSourceCodeLanguage.PYTHON
        ? SiPython
        : sourceCodeLanguage === EvalTemplateSourceCodeLanguage.TYPESCRIPT
          ? SiTypescript
          : null;

    return (
      <Badge className="w-fit gap-1.5" variant="outline-solid">
        {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
        {label}
      </Badge>
    );
  }

  return (
    <Badge className="w-fit gap-1.5" variant="outline-solid">
      LLM-as-judge
    </Badge>
  );
};

const templateTableRowHeights: CustomHeights = {
  s: "h-8",
  m: "h-8",
  l: "h-8",
};

// Owns the per-row actions dropdown plus the delete confirm dialog as its
// sibling (see the overlay-lifecycle rule in web/AGENTS.md). The dialog's
// open state is local so opening it re-renders only this cell, not the table.
const EvalTemplateRowActionsMenu = ({
  projectId,
  templateId,
  templateName,
  usageCount,
  hasAccess,
  showClone,
  showEditAndDelete,
  onEdit,
  onClone,
}: {
  projectId: string;
  templateId: string;
  templateName: string;
  usageCount?: number;
  hasAccess: boolean;
  showClone: boolean;
  showEditAndDelete: boolean;
  onEdit: () => void;
  onClone: () => void;
}) => {
  // undefined = never opened: keeps the dialog unmounted for untouched rows,
  // while close (false) keeps it mounted so the exit animation can play.
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const hasTemplateWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:CUD",
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="actions">
            <span className="sr-only relative">Open menu</span>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {showClone ? (
            <DropdownMenuItem
              aria-label="clone"
              disabled={!hasAccess}
              onClick={(e) => {
                e.stopPropagation();
                onClone();
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Clone
            </DropdownMenuItem>
          ) : null}
          {showEditAndDelete ? (
            <>
              <DropdownMenuItem
                aria-label="edit"
                disabled={!hasAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pen className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-label="delete"
                disabled={!hasTemplateWriteAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  capture("eval_templates:delete_form_open", {
                    source: "table-single-row",
                  });
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {isDeleteDialogOpen !== undefined ? (
        <DeleteEvalTemplateDialog
          projectId={projectId}
          templateId={templateId}
          templateName={templateName}
          initialUsageCount={usageCount}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onSuccess={() => {
            capture("eval_templates:delete_template_button_click", {
              source: "table-single-row",
            });
            utils.evals.templateNames.invalidate();
          }}
        />
      ) : null}
    </>
  );
};

export default function EvalsTemplateTable({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const codeEvalCapabilities = useIsCodeEvalEnabled();
  const { enabled: isCodeEvalEnabled, supportedSourceCodeLanguages } =
    codeEvalCapabilities;
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [cloneTemplateId, setCloneTemplateId] = useState<string | null>(null);
  const [showReferenceUpdateDialog, setShowReferenceUpdateDialog] =
    useState(false);
  const [pendingCloneSubmission, setPendingCloneSubmission] =
    useState<CloneCreateTemplateInput | null>(null);

  const utils = api.useUtils();
  const templates = api.evals.templateNames.useQuery({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchQuery: searchQuery,
  });

  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });

  const totalCount = templates.data?.totalCount ?? null;

  const template = api.evals.templateById.useQuery(
    {
      projectId: projectId,
      id: editTemplateId as string,
    },
    {
      enabled: !!editTemplateId,
    },
  );

  const cloneTemplate = api.evals.templateById.useQuery(
    {
      projectId: projectId,
      id: cloneTemplateId as string,
    },
    {
      enabled: !!cloneTemplateId,
    },
  );

  const evaluatorLimit = useEntitlementLimit(
    "model-based-evaluations-count-evaluators",
  );

  // Fetch counts of evaluator configs and templates
  const countsQuery = api.evals.counts.useQuery(
    {
      projectId,
    },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const { isTemplateInvalid } = useSingleTemplateValidation({
    projectId,
  });

  const createEvalTemplateMutation = api.evals.createTemplate.useMutation({
    onSuccess: () => {
      utils.evals.templateNames.invalidate();
      setCloneTemplateId(null);
      setPendingCloneSubmission(null);
      setShowReferenceUpdateDialog(false);
      showSuccessToast({
        title: "Evaluator cloned successfully",
        description:
          "This evaluator is now available and maintained on project level.",
      });
    },
    onError: (error) => {
      showErrorToast("Error cloning evaluator", error.message);
    },
  });

  const submitPendingClone = (retargetUsingJobConfigs: boolean) => {
    if (!pendingCloneSubmission) return;

    createEvalTemplateMutation.mutate({
      ...pendingCloneSubmission,
      retargetUsingJobConfigs,
    });
  };

  useEffect(() => {
    if (templates.isSuccess) {
      const { templates: templateList = [] } = templates.data ?? {};
      setDetailPageList(
        "eval-templates",
        templateList
          .filter((template) =>
            shouldShowEvalTemplate(template, {
              enabled: isCodeEvalEnabled,
              supportedSourceCodeLanguages,
            }),
          )
          .map((template) => ({ id: template.latestId })),
      );
    }
  }, [
    templates.isSuccess,
    templates.data,
    isCodeEvalEnabled,
    supportedSourceCodeLanguages,
    setDetailPageList,
  ]);

  const columnHelper = createColumnHelper<EvalsTemplateRow>();

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      cell: (row) => {
        const name = row.getValue();
        return name ? <TableIdOrName value={name} /> : undefined;
      },
    }),
    columnHelper.accessor("type", {
      id: "type",
      header: "Type",
      size: 120,
      cell: ({ row }) => (
        <TemplateTypeBadge
          type={row.original.type}
          sourceCodeLanguage={row.original.sourceCodeLanguage}
        />
      ),
    }),
    columnHelper.accessor("resultType", {
      id: "resultType",
      header: "Score Result Type",
      size: 120,
      cell: (row) => {
        const resultType = row.getValue();

        return (
          <Badge className="w-fit self-start" variant="outline-solid">
            {resultType}
          </Badge>
        );
      },
    }),
    columnHelper.accessor("maintainer", {
      id: "maintainer",
      header: "Maintainer",
      size: 150,
      cell: (row) => {
        return (
          <div className="flex items-center gap-2">
            <MaintainerTooltip maintainer={row.getValue()} />
            <span className="text-muted-foreground">
              {getMaintainerLabel(row.getValue())}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor("latestCreatedAt", {
      header: "Last Edited",
      id: "latestCreatedAt",
      size: 80,
      cell: (row) => {
        return row.getValue()?.toLocaleDateString();
      },
    }),
    columnHelper.accessor("usageCount", {
      header: "Usage Count",
      id: "usageCount",
      enableHiding: true,
      size: 80,
      cell: (row) => {
        const count = row.getValue();
        return !!count ? count : null;
      },
    }),
    columnHelper.accessor("latestVersion", {
      header: "Latest Version",
      id: "latestVersion",
      enableHiding: true,
      size: 80,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("id", {
      header: "Id",
      id: "id",
      size: 100,
      enableHiding: true,
      cell: (row) => {
        const id = row.getValue();
        return id ? <TableIdOrName value={id} /> : null;
      },
    }),
    columnHelper.accessor("actions", {
      header: "Actions",
      id: "actions",
      size: 100,
      cell: ({ row }) => {
        const id = row.original.id;
        const isInvalid = isTemplateInvalid(row.original);
        const isCodeTemplate = row.original.type === EvalTemplateType.CODE;
        const isUserMaintained = row.original.maintainer.includes("User");
        const hasMenuItems = isUserMaintained || !isCodeTemplate;

        return (
          <div className="flex flex-row items-center gap-2">
            <ActionButton
              variant="outline"
              size="sm"
              aria-label="apply"
              disabled={isInvalid}
              title={
                isInvalid
                  ? "Evaluator requires project-level evaluation model. Set it up and start running evaluations."
                  : undefined
              }
              hasAccess={hasAccess}
              limitValue={countsQuery.data?.configActiveCount ?? 0}
              limit={evaluatorLimit}
              onClick={(e) => {
                e.stopPropagation();
                if (id) {
                  router.push(
                    `/project/${projectId}/evals/new?evaluator=${id}`,
                  );
                }
              }}
            >
              Use Evaluator
            </ActionButton>
            {hasMenuItems && id ? (
              <EvalTemplateRowActionsMenu
                projectId={projectId}
                templateId={id}
                templateName={row.original.name}
                usageCount={row.original.usageCount}
                hasAccess={hasAccess}
                showClone={!isUserMaintained && !isCodeTemplate}
                showEditAndDelete={isUserMaintained}
                onEdit={() => setEditTemplateId(id)}
                onClone={() => setCloneTemplateId(id)}
              />
            ) : null}
          </div>
        );
      },
    }),
  ] as LangfuseColumnDef<EvalsTemplateRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalsTemplateRow>(
      "evalTemplatesColumnVisibility",
      columns,
    );

  const peekNavigationProps = usePeekNavigation({
    expandConfig: {
      basePath: `/project/${projectId}/evals/templates`,
    },
  });

  const peekConfig = useMemo(
    () => ({
      itemType: "EVALUATOR" as const,
      detailNavigationKey: "eval-templates",
      peekEventOptions: {
        ignoredSelectors: [
          "[aria-label='apply'], [aria-label='actions'], [aria-label='edit'], [aria-label='clone'], [aria-label='delete']",
        ],
      },
      ...peekNavigationProps,
    }),
    [peekNavigationProps],
  );

  const convertToTableRow = (
    template: RouterOutputs["evals"]["templateNames"]["templates"][number],
  ): EvalsTemplateRow => {
    return {
      name: template.name,
      resultType:
        template.type === EvalTemplateType.CODE
          ? "Code-defined"
          : getTemplateResultType(template.outputDefinition),
      maintainer: getMaintainer(template),
      latestCreatedAt: template.latestCreatedAt,
      latestVersion: template.version,
      id: template.latestId,
      usageCount: template.usageCount,
      provider: template.provider ?? null,
      model: template.model ?? null,
      type: template.type,
      sourceCodeLanguage: template.sourceCodeLanguage,
    };
  };

  return (
    <>
      <div className="flex h-full w-full flex-col">
        <DataTableToolbar
          columns={columns}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          searchConfig={{
            metadataSearchFields: ["Name"],
            updateQuery: setSearchQuery,
            currentQuery: searchQuery ?? undefined,
            tableAllowsFullTextSearch: false,
            setSearchType: undefined,
            searchType: undefined,
          }}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DataTable
            tableName="evalTemplates"
            columns={columns}
            peekView={peekConfig}
            // "s" vertically centers cell content; the custom heights keep the
            // row at h-8 regardless
            rowHeight="s"
            customRowHeights={templateTableRowHeights}
            data={
              templates.isLoading
                ? { isLoading: true, isError: false }
                : templates.isError
                  ? {
                      isLoading: false,
                      isError: true,
                      error: templates.error.message,
                    }
                  : {
                      isLoading: false,
                      isError: false,
                      data: safeExtract(templates.data, "templates", [])
                        .filter((template) =>
                          shouldShowEvalTemplate(
                            template,
                            codeEvalCapabilities,
                          ),
                        )
                        .map((t) => convertToTableRow(t)),
                    }
            }
            pagination={{
              totalCount,
              onChange: setPaginationState,
              state: paginationState,
            }}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
        </div>
      </div>
      <TablePeekViewEvaluatorTemplateDetail
        {...peekConfig}
        projectId={projectId}
      />
      <Dialog
        open={!!editTemplateId && template.isSuccess}
        onOpenChange={(open) => {
          if (!open) setEditTemplateId(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-(--breakpoint-md) overflow-y-auto"
          confirmCloseOnEscape={
            template.data?.type === EvalTemplateType.CODE
              ? CODE_EVAL_ESCAPE_CONFIRM_MESSAGE
              : undefined
          }
        >
          <DialogHeader>
            <DialogTitle>Edit evaluator</DialogTitle>
          </DialogHeader>
          <EvalTemplateForm
            projectId={projectId}
            preventRedirect={true}
            useDialog={true}
            isEditing={true}
            existingEvalTemplate={template.data ?? undefined}
            onFormSuccess={() => {
              setEditTemplateId(null);
              utils.evals.templateNames.invalidate();
              showSuccessToast({
                title: "Evaluator updated successfully",
                description: "You can now use this evaluator.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!cloneTemplateId && cloneTemplate.isSuccess}
        onOpenChange={(open) => {
          if (!open) {
            setCloneTemplateId(null);
            setPendingCloneSubmission(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-(--breakpoint-md) overflow-y-auto"
          confirmCloseOnEscape={
            cloneTemplate.data?.type === EvalTemplateType.CODE
              ? CODE_EVAL_ESCAPE_CONFIRM_MESSAGE
              : undefined
          }
        >
          <DialogHeader>
            <DialogTitle>Clone evaluator</DialogTitle>
          </DialogHeader>
          <EvalTemplateForm
            projectId={projectId}
            preventRedirect={true}
            useDialog={true}
            isEditing={true}
            existingEvalTemplate={
              cloneTemplate.data
                ? {
                    name: `${cloneTemplate.data.name} (project-level)`,
                    prompt: cloneTemplate.data.prompt,
                    vars: cloneTemplate.data.vars,
                    outputDefinition: cloneTemplate.data
                      .outputDefinition as EvalTemplate["outputDefinition"],
                    type: cloneTemplate.data.type,
                    provider: cloneTemplate.data.provider,
                    model: cloneTemplate.data.model,
                    modelParams: cloneTemplate.data.modelParams as any,
                    partner: cloneTemplate.data.partner,
                    projectId,
                  }
                : undefined
            }
            cloneSourceId={cloneTemplateId}
            onBeforeSubmit={(template) => {
              // Only show reference dialog for Langfuse maintained templates
              if (
                cloneTemplateId &&
                cloneTemplate.data &&
                !cloneTemplate.data.projectId
              ) {
                if (template.intent !== "clone") return true;
                setPendingCloneSubmission(template);
                setShowReferenceUpdateDialog(true);
                return false; // Prevent immediate submission
              }
              return true; // Continue with submission
            }}
            onFormSuccess={() => {
              setCloneTemplateId(null);
              setPendingCloneSubmission(null);
              utils.evals.templateNames.invalidate();
              showSuccessToast({
                title: "Evaluator cloned successfully",
                description:
                  "This evaluator is now available and maintained on project level. ",
              });
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={showReferenceUpdateDialog}
        onOpenChange={(open) => {
          if (!open && pendingCloneSubmission) {
            // If dialog is closed without a decision, default to not updating references
            submitPendingClone(false);
          }
          setShowReferenceUpdateDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update running evaluators?</DialogTitle>
            <DialogDescription>
              Do you want all running evaluators attached to the original
              Langfuse evaluator to reference your new project-level version?
              <br />
              <br />
              <strong>Warning:</strong> This might break workflows if you have
              changed variables or other critical aspects of the template.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                submitPendingClone(false);
              }}
            >
              No, keep as is
            </Button>
            <Button
              onClick={() => {
                submitPendingClone(true);
              }}
            >
              Yes, update all references
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
