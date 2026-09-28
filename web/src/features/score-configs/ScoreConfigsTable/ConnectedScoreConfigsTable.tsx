import { useMemo } from "react";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { ArchiveScoreConfigDialogController } from "@/src/features/score-configs/components/ArchiveScoreConfigDialogController";
import {
  CreateScoreConfigDialogController,
  EditScoreConfigDialogController,
} from "@/src/features/score-configs/components/UpsertScoreConfigDialogController";
import {
  ScoreConfigsTable,
  type ScoreConfigTableRow,
} from "@/src/features/score-configs/ScoreConfigsTable/ScoreConfigsTable";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { api } from "@/src/utils/api";

export function ConnectedScoreConfigsTable({
  projectId,
}: {
  projectId: string;
}) {
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });

  const configs = api.scoreConfigs.all.useQuery(
    {
      projectId,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: hasAccess },
  );

  const tableData = useMemo<AsyncTableData<ScoreConfigTableRow[]>>(() => {
    if (configs.isPending) return { status: "loading" };
    if (configs.isError)
      return { status: "error", error: configs.error.message };

    return {
      status: "success",
      data:
        configs.data?.configs.map((config) => ({
          id: config.id,
          name: config.name,
          dataType: config.dataType,
          description: config.description,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          range: {
            maxValue: config.maxValue,
            minValue: config.minValue,
            categories: config.categories,
          },
          isArchived: config.isArchived,
        })) ?? [],
    };
  }, [
    configs.data?.configs,
    configs.error?.message,
    configs.isError,
    configs.isPending,
  ]);

  return (
    <EditScoreConfigDialogController projectId={projectId}>
      {(editControl) => (
        <ArchiveScoreConfigDialogController projectId={projectId}>
          {(archiveControl) => (
            <CreateScoreConfigDialogController projectId={projectId}>
              {(createControl) => (
                <ScoreConfigsTable
                  data={tableData}
                  pagination={{
                    mode: "offset",
                    totalCount: configs.data?.totalCount ?? null,
                    onChange: setPaginationState,
                    state: paginationState,
                  }}
                  createAction={{
                    disabled: createControl.disabled,
                    loading: createControl.isSubmitting,
                    onClick: createControl.openDialog,
                  }}
                  editAction={{
                    disabled: editControl.disabled,
                    openDialog: (config) =>
                      editControl.openDialog({
                        id: config.id,
                        name: config.name,
                        dataType: config.dataType,
                        minValue: config.range.minValue ?? undefined,
                        maxValue: config.range.maxValue ?? undefined,
                        description: config.description ?? undefined,
                        categories: config.range.categories?.length
                          ? config.range.categories
                          : undefined,
                      }),
                  }}
                  archiveAction={{
                    disabled: archiveControl.disabled,
                    openDialog: (config) => archiveControl.openDialog(config),
                  }}
                />
              )}
            </CreateScoreConfigDialogController>
          )}
        </ArchiveScoreConfigDialogController>
      )}
    </EditScoreConfigDialogController>
  );
}
