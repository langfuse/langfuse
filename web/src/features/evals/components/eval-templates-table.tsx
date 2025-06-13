import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type RouterOutputs, api } from "@/src/utils/api";
import { createColumnHelper } from "@tanstack/react-table";
import { Copy, Pen } from "lucide-react";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { useEffect, useState } from "react";
import TableIdOrName from "@/src/components/table/table-id";
import { PeekViewEvaluatorTemplateDetail } from "@/src/components/table/peek/peek-evaluator-template-detail";
import { useEvalTemplatesPeekNavigation } from "@/src/components/table/peek/hooks/useEvalTemplatesPeekNavigation";
import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
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
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { EvalReferencedEvaluators } from "@/src/features/evals/types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type RouterInput } from "@/src/utils/types";
import { useSingleTemplateValidation } from "@/src/features/evals/hooks/useSingleTemplateValidation";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { ActionButton } from "@/src/components/ActionButton";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export type EvalsTemplateRow = {
  name: string;
  maintainer: string;
  latestCreatedAt?: Date;
  latestVersion?: number;
  id?: string;
  usageCount?: number;
  actions?: string;
  provider?: string;
  model?: string;
};

export default function EvalsTemplateTable({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [cloneTemplateId, setCloneTemplateId] = useState<string | null>(null);
  const [showReferenceUpdateDialog, setShowReferenceUpdateDialog] =
    useState(false);
  const [pendingCloneSubmission, setPendingCloneSubmission] = useState<
    RouterInput["evals"]["createTemplate"] | null
  >(null);
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
      void utils.evals.templateNames.invalidate();
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

  useEffect(() => {
    if (templates.isSuccess) {
      setDetailPageList(
        "eval-templates",
        templates.data.templates.map((template) => ({ id: template.latestId })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.isSuccess, templates.data]);

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
    columnHelper.accessor("maintainer", {
      id: "maintainer",
      header: "Maintainer",
      size: 150,
      cell: (row) => {
        return (
          <div className="flex justify-center">
            <MaintainerTooltip maintainer={row.getValue()} />
          </div>
        );
      },
    }),
    columnHelper.accessor("latestCreatedAt", {
      header: "Last Edit",
      id: "latestCreatedAt",
      cell: (row) => {
        return row.getValue()?.toLocaleDateString();
      },
    }),
    columnHelper.accessor("usageCount", {
      header: "Usage count",
      id: "usageCount",
      enableHiding: true,
      cell: (row) => {
        const count = row.getValue();
        return !!count ? count : null;
      },
    }),
    columnHelper.accessor("latestVersion", {
      header: "Latest Version",
      id: "latestVersion",
      enableHiding: true,
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
        const provider = row.original.provider ?? null;
        const model = row.original.model ?? null;
        const isInvalid = isTemplateInvalid({ provider, model });

        return (
          <div className="flex flex-row gap-2">
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
                  void router.push(
                    `/project/${projectId}/evals/new?evaluator=${id}`,
                  );
                }
              }}
            >
              Use Evaluator
            </ActionButton>
            {!row.original.maintainer.includes("User") ? (
              <Button
                aria-label="clone"
                variant="outline"
                size="icon-xs"
                title="Clone"
                disabled={!hasAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  if (id) setCloneTemplateId(id);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                aria-label="edit"
                variant="outline"
                size="icon-xs"
                title="Edit"
                disabled={!hasAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  if (id) setEditTemplateId(id);
                }}
              >
                <Pen className="h-3 w-3" />
              </Button>
            )}
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

  const { getNavigationPath, expandPeek } = useEvalTemplatesPeekNavigation();
  const { setPeekView } = usePeekState();

  const convertToTableRow = (
    template: RouterOutputs["evals"]["templateNames"]["templates"][number],
  ): EvalsTemplateRow => {
    return {
      name: template.name,
      maintainer: getMaintainer(template),
      latestCreatedAt: template.latestCreatedAt,
      latestVersion: template.version,
      id: template.latestId,
      usageCount: template.usageCount,
      provider: template.provider,
      model: template.model,
    };
  };

  return (
    <>
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
      <DataTable
        columns={columns}
        peekView={{
          itemType: "EVALUATOR",
          listKey: "eval-templates",
          onOpenChange: setPeekView,
          onExpand: expandPeek,
          shouldUpdateRowOnDetailPageNavigation: true,
          getNavigationPath,
          children: () => (
            <PeekViewEvaluatorTemplateDetail projectId={projectId} />
          ),
          peekEventOptions: {
            ignoredSelectors: [
              "[aria-label='apply'], [aria-label='actions'], [aria-label='edit'], [aria-label='clone']",
            ],
          },
          tableDataUpdatedAt: templates.dataUpdatedAt,
        }}
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
                  data: templates.data.templates.map((t) =>
                    convertToTableRow(t),
                  ),
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
      <Dialog
        open={!!editTemplateId && template.isSuccess}
        onOpenChange={(open) => {
          if (!open) setEditTemplateId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
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
              void utils.evals.templateNames.invalidate();
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
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
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
                    outputSchema: cloneTemplate.data.outputSchema as {
                      score: string;
                      reasoning: string;
                    },
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
                setPendingCloneSubmission({
                  ...template,
                  cloneSourceId: cloneTemplateId,
                });
                setShowReferenceUpdateDialog(true);
                return false; // Prevent immediate submission
              }
              return true; // Continue with submission
            }}
            onFormSuccess={() => {
              setCloneTemplateId(null);
              setPendingCloneSubmission(null);
              void utils.evals.templateNames.invalidate();
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
            pendingCloneSubmission.referencedEvaluators =
              EvalReferencedEvaluators.PERSIST;
            createEvalTemplateMutation.mutate(pendingCloneSubmission);
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
                if (pendingCloneSubmission) {
                  // Submit with PERSIST option
                  pendingCloneSubmission.referencedEvaluators =
                    EvalReferencedEvaluators.PERSIST;
                  createEvalTemplateMutation.mutate(pendingCloneSubmission);
                }
              }}
            >
              No, keep as is
            </Button>
            <Button
              onClick={() => {
                if (pendingCloneSubmission) {
                  // Submit with UPDATE option
                  pendingCloneSubmission.referencedEvaluators =
                    EvalReferencedEvaluators.UPDATE;
                  createEvalTemplateMutation.mutate(pendingCloneSubmission);
                }
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
