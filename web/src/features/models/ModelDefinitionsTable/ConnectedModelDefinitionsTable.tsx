import { useRouter } from "next/router";
import { FlaskConical, PlusIcon } from "@langfuse/icons";
import { useMemo, useRef } from "react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { UpsertModelFormDialogController } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogController";
import { UpsertModelFormDialogContent } from "@/src/features/models/components/UpsertModelFormDialog/UpsertModelFormDialogContent";
import { TestModelMatchDialogContent } from "@/src/features/models/components/test-match/TestModelMatchDialogContent";
import {
  useDeleteModelDefinition,
  useModelDefinitionList,
  useModelLastUsed,
} from "@/src/features/models/hooks/useModelDefinitionApi";
import { modelMaintainerByScope } from "@/src/features/models/modelMaintainer";
import {
  cloneLabelFor,
  isEditableIn,
  modelDetailHref,
  type ModelOwner,
  useCanEditModels,
} from "@/src/features/models/modelOwner";
import {
  type GetModelResult,
  type ModelListItem,
} from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { reportTrpcErrorWithoutToast } from "@/src/utils/api";
import {
  ModelDefinitionsTable,
  type ModelTableRow,
} from "./ModelDefinitionsTable";

export function ConnectedModelDefinitionsTable({
  owner,
}: {
  owner: ModelOwner;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const deleteModel = useDeleteModelDefinition(owner);
  const editCloseGuard = useRef<() => boolean>(() => true);
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [queryParams, setQueryParams] = useQueryParams({
    search: withDefault(StringParam, ""),
  });
  const models = useModelDefinitionList(owner, {
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchString: queryParams.search,
  });
  const modelIds = models.data?.models.map((model) => model.id) ?? [];
  const lastUsed = useModelLastUsed(owner, models.isSuccess ? modelIds : []);
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("models", "m");
  const hasWriteAccess = useCanEditModels(owner);

  const ownerScope = owner.scope;
  const data = useMemo<AsyncTableData<ModelTableRow[]>>(() => {
    if (models.isPending) {
      return { status: "loading" };
    }
    if (models.isError) {
      return { status: "error", error: models.error.message };
    }
    return {
      status: "success",
      data: (models.data?.models ?? []).map((model) =>
        convertToTableRow(ownerScope, model),
      ),
    };
  }, [ownerScope, models.isPending, models.isError, models.error, models.data]);

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <TestModelMatchDialogContent owner={owner} open onClose={closeDialog} />
      )}
    >
      {({ openDialog: openTestMatchDialog }) => (
        <DialogController<{
          action: "edit" | "clone";
          model: GetModelResult;
        }>
          onBeforeClose={() => editCloseGuard.current()}
          renderDialog={({ state, closeDialog }) => (
            <UpsertModelFormDialogContent
              owner={owner}
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
              <UpsertModelFormDialogController owner={owner} action="create">
                {({ openDialog: openCreateDialog }) => (
                  <ConfirmationDialogController<GetModelResult>
                    title="Delete model?"
                    text="This action permanently deletes this model definition."
                    confirmLabel="Delete model"
                    variant="destructive"
                    loading={deleteModel.isPending}
                    error={deleteModel.error}
                    onAfterDismiss={deleteModel.reset}
                    onConfirm={async (model) => {
                      capture("models:delete_button_click");
                      try {
                        await deleteModel.remove(model.id);
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
                          mode: "offset",
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
                        lastUsed={
                          owner.scope === "project"
                            ? (lastUsed.data ?? "loading")
                            : undefined
                        }
                        toolbarActions={[
                          {
                            id: "test-model-match",
                            label: "Test Model Match",
                            variant: "secondary",
                            icon: <FlaskConical size="base" />,
                            onClick: openTestMatchDialog,
                          },
                          {
                            id: "add-model-definition",
                            label: "Add Model Definition",
                            variant: "secondary",
                            icon: <PlusIcon size="base" />,
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
                        cloneLabel={cloneLabelFor(owner)}
                        onRowClick={(model) => {
                          router.push(modelDetailHref(owner, model.modelId));
                        }}
                      />
                    )}
                  </ConfirmationDialogController>
                )}
              </UpsertModelFormDialogController>
            );
          }}
        </DialogController>
      )}
    </DialogController>
  );
}

function convertToTableRow(
  ownerScope: ModelOwner["scope"],
  model: ModelListItem,
): ModelTableRow {
  return {
    modelId: model.id,
    maintainer: modelMaintainerByScope[model.scope],
    modelName: model.modelName,
    matchPattern: model.matchPattern,
    editable: isEditableIn(ownerScope, model.scope),
    isOverridden: model.isOverridden,
    serverResponse: model,
  };
}
