import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, reportNonTrpcError } from "@/src/utils/api";
import {
  ApiKeySettingsTable,
  type ApiKeySettingsTableRow,
} from "./ApiKeySettingsTable";

type ApiKeyScope = "project" | "organization";

export function ConnectedApiKeySettingsTable({
  entityId,
  scope,
  hasWriteAccess,
}: {
  entityId: string;
  scope: ApiKeyScope;
  hasWriteAccess: boolean;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();

  const projectApiKeys = api.projectApiKeys.byProjectId.useQuery(
    { projectId: entityId },
    { enabled: scope === "project" },
  );
  const organizationApiKeys = api.organizationApiKeys.byOrganizationId.useQuery(
    { orgId: entityId },
    { enabled: scope === "organization" },
  );
  const apiKeys = scope === "project" ? projectApiKeys : organizationApiKeys;

  const deleteProjectApiKey = api.projectApiKeys.delete.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const deleteOrganizationApiKey = api.organizationApiKeys.delete.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });
  const tableData = useMemo<AsyncTableData<ApiKeySettingsTableRow[]>>(() => {
    if (apiKeys.isLoading) return { status: "loading" };
    if (apiKeys.isError) {
      return { status: "error", error: "Failed to load API keys" };
    }
    return { status: "success", data: apiKeys.data ?? [] };
  }, [apiKeys.data, apiKeys.isError, apiKeys.isLoading]);

  const deleteApiKey =
    scope === "project" ? deleteProjectApiKey : deleteOrganizationApiKey;

  return (
    <ConnectedApiKeyNoteDialogController entityId={entityId} scope={scope}>
      {({ openDialog: openEditNoteDialog }) => (
        <ConfirmationDialogController<{ id: string }>
          title="Delete API key"
          text="Are you sure you want to delete this API key? This action cannot be undone."
          confirmLabel="Permanently delete"
          variant="destructive"
          loading={deleteApiKey.isPending}
          error={deleteApiKey.error?.message}
          onAfterDismiss={deleteApiKey.reset}
          onConfirm={async (apiKey) => {
            try {
              if (scope === "project") {
                await deleteProjectApiKey.mutateAsync({
                  projectId: entityId,
                  id: apiKey.id,
                });
              } else {
                await deleteOrganizationApiKey.mutateAsync({
                  orgId: entityId,
                  id: apiKey.id,
                });
              }
              capture(`${scope}_settings:api_key_delete`);
            } catch (error) {
              reportNonTrpcError(error, "api-keys");
              throw error;
            }
          }}
        >
          {({ openDialog: openDeleteDialog }) => (
            <ApiKeySettingsTable
              data={tableData}
              editNoteAction={{
                hasAccess: hasWriteAccess,
                onClick: openEditNoteDialog,
              }}
              hasWriteAccess={hasWriteAccess}
              onDelete={openDeleteDialog}
              noResultsMessage="None"
            />
          )}
        </ConfirmationDialogController>
      )}
    </ConnectedApiKeyNoteDialogController>
  );
}

function ConnectedApiKeyNoteDialogController({
  children,
  entityId,
  scope,
}: {
  children: (control: {
    openDialog: (apiKey: ApiKeySettingsTableRow) => void;
  }) => ReactNode;
  entityId: string;
  scope: ApiKeyScope;
}) {
  const utils = api.useUtils();
  const instance = useRef(0);
  const updateProjectApiKey = api.projectApiKeys.updateNote.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const updateOrganizationApiKey =
    api.organizationApiKeys.updateNote.useMutation({
      onSuccess: () => utils.organizationApiKeys.invalidate(),
    });
  const updateApiKey =
    scope === "project" ? updateProjectApiKey : updateOrganizationApiKey;

  return (
    <DialogController<ApiKeySettingsTableRow & { instance: number }>
      onBeforeClose={() => !updateApiKey.isPending}
      onDismiss={updateApiKey.reset}
      renderDialog={({ state, closeDialog }) => (
        <ApiKeyNoteDialog
          key={state.instance}
          apiKey={state}
          error={updateApiKey.error?.message}
          isPending={updateApiKey.isPending}
          onSave={async (note) => {
            try {
              if (scope === "project") {
                await updateProjectApiKey.mutateAsync({
                  projectId: entityId,
                  keyId: state.id,
                  note,
                });
              } else {
                await updateOrganizationApiKey.mutateAsync({
                  orgId: entityId,
                  keyId: state.id,
                  note,
                });
              }
              closeDialog();
            } catch (error) {
              reportNonTrpcError(error, "api-keys");
            }
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: (apiKey) =>
            openDialog({ ...apiKey, instance: ++instance.current }),
        })
      }
    </DialogController>
  );
}

function ApiKeyNoteDialog({
  apiKey,
  error,
  isPending,
  onSave,
}: {
  apiKey: ApiKeySettingsTableRow;
  error?: string;
  isPending: boolean;
  onSave: (note: string) => Promise<void>;
}) {
  const inputId = useId();
  const [note, setNote] = useState(apiKey.note ?? "");

  return (
    <Dialog
      title="Edit API key note"
      actions={[
        {
          label: "Save",
          loading: isPending,
          disabled: note === (apiKey.note ?? ""),
          onClick: () => onSave(note),
        },
      ]}
    >
      <Dialog.Body>
        <div className="grid gap-2">
          <label htmlFor={inputId} className="text-sm leading-none font-bold">
            Note
          </label>
          <Input
            id={inputId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isPending}
            error={Boolean(error)}
            autoFocus
          />
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
      </Dialog.Body>
    </Dialog>
  );
}
