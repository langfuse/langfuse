import { useRouter } from "next/router";
import { FlaskConical, PlusIcon } from "lucide-react";
import { useRef } from "react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { PriceUnitSelector } from "@/src/features/models/components/PriceUnitSelector";
import {
  UpsertModelFormDialogController,
  UpsertModelFormDialogContent,
} from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { TestModelMatchDialogContent } from "@/src/features/models/components/test-match/TestModelMatchDialog";
import { usePriceUnitMultiplier } from "@/src/features/models/hooks/usePriceUnitMultiplier";
import { type GetModelResult } from "@/src/features/models/validation";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import {
  ModelDefinitionsTable,
  type ModelTableRow,
} from "./ModelDefinitionsTable";

export function ConnectedModelDefinitionsTable({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const deleteModel = api.models.delete.useMutation({
    onSuccess: () => utils.models.invalidate(),
  });
  const editCloseGuard = useRef<() => boolean>(() => true);
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [queryParams, setQueryParams] = useQueryParams({
    search: withDefault(StringParam, ""),
  });
  const models = api.models.getAll.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      searchString: queryParams.search,
    },
    {
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 10,
    },
  );
  const modelIds = models.data?.models.map((model) => model.id) ?? [];
  const lastUsed = api.models.lastUsedByModelIds.useQuery(
    { projectId, modelIds },
    {
      enabled: models.isSuccess && modelIds.length > 0,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 10,
    },
  );
  const { priceUnit, priceUnitMultiplier } = usePriceUnitMultiplier();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("models", "m");
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  let data: AsyncTableData<ModelTableRow[]>;
  if (models.isPending) {
    data = { status: "loading" };
  } else if (models.isError) {
    data = { status: "error", error: models.error.message };
  } else {
    data = {
      status: "success",
      data: (models.data?.models ?? []).map(convertToTableRow),
    };
  }

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <TestModelMatchDialogContent
          projectId={projectId}
          open
          onClose={closeDialog}
        />
      )}
    >
      {({ openDialog: openTestMatchDialog }) => (
        <>
          <DialogController<{
            action: "edit" | "clone";
            model: GetModelResult;
          }>
            onBeforeClose={() => editCloseGuard.current()}
            renderDialog={({ state, closeDialog }) => (
              <UpsertModelFormDialogContent
                projectId={projectId}
                action={state.action}
                modelData={state.model}
                closeDialog={closeDialog}
                closeGuardRef={editCloseGuard}
              />
            )}
          >
            {({ openDialog }) => {
              const openCloneDialog = (model: ModelTableRow) => {
                openDialog({
                  action: "clone",
                  model: model.serverResponse,
                });
              };
              const openEditDialog = (model: ModelTableRow) => {
                openDialog({
                  action: "edit",
                  model: model.serverResponse,
                });
              };

              return (
                <UpsertModelFormDialogController
                  projectId={projectId}
                  action="create"
                >
                  {({ openDialog: openCreateDialog }) => (
                    <ConfirmationDialogController<GetModelResult>
                      title="Delete model?"
                      text="This action permanently deletes this model definition."
                      confirmLabel="Delete model"
                      variant="destructive"
                      loading={deleteModel.isPending}
                      error={deleteModel.error?.message}
                      onAfterDismiss={deleteModel.reset}
                      onConfirm={async (model) => {
                        capture("models:delete_button_click");
                        try {
                          await deleteModel.mutateAsync({
                            projectId,
                            modelId: model.id,
                          });
                        } catch (error) {
                          reportTrpcErrorWithoutToast(error, "models");
                          throw error;
                        }
                      }}
                    >
                      {({ openDialog: openDeleteDialog }) => (
                        <ModelDefinitionsTable
                          data={data}
                          pagination={{
                            totalCount: models.data?.totalCount ?? null,
                            onChange: setPaginationState,
                            state: paginationState,
                          }}
                          search={{
                            value: queryParams.search,
                            onChange: (search) => setQueryParams({ search }),
                          }}
                          rowHeight={rowHeight}
                          onRowHeightChange={setRowHeight}
                          priceUnit={priceUnit}
                          priceUnitMultiplier={priceUnitMultiplier}
                          priceUnitSelector={<PriceUnitSelector />}
                          lastUsed={lastUsed.data}
                          toolbarActions={[
                            {
                              id: "test-model-match",
                              label: "Test Model Match",
                              variant: "secondary",
                              icon: <FlaskConical className="h-4 w-4" />,
                              onClick: openTestMatchDialog,
                            },
                            {
                              id: "add-model-definition",
                              label: "Add Model Definition",
                              variant: "secondary",
                              icon: <PlusIcon className="h-4 w-4" />,
                              hasAccess: hasWriteAccess,
                              trackingEventName: "models:new_form_open",
                              onClick: openCreateDialog,
                            },
                          ]}
                          modelActions={{
                            canEdit: hasWriteAccess,
                            onClone: openCloneDialog,
                            onEdit: openEditDialog,
                            onDelete: (model) => {
                              deleteModel.reset();
                              openDeleteDialog(model.serverResponse);
                            },
                          }}
                          onRowClick={(model) => {
                            router.push(
                              `/project/${projectId}/settings/models/${model.modelId}`,
                            );
                          }}
                        />
                      )}
                    </ConfirmationDialogController>
                  )}
                </UpsertModelFormDialogController>
              );
            }}
          </DialogController>
        </>
      )}
    </DialogController>
  );
}

function convertToTableRow(model: GetModelResult): ModelTableRow {
  const prices = model.pricingTiers.find((tier) => tier.isDefault)?.prices;
  return {
    modelId: model.id,
    maintainer: model.projectId ? "User" : "Langfuse",
    modelName: model.modelName,
    matchPattern: model.matchPattern,
    prices,
    tokenizerId: model.tokenizerId ?? undefined,
    config: model.tokenizerConfig,
    serverResponse: model,
  };
}
