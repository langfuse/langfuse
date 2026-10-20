import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SEPARATE_GATEWAY_API_KEYS } from "@/src/features/ai-gateway/fns/separateGatewayApiKeys";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, reportNonTrpcError } from "@/src/utils/api";
import {
  ApiKeySettingsTable,
  type ApiKeySettingsTableRow,
} from "./ApiKeySettingsTable";

type ApiKeyScope = "project" | "organization";

const KEY_FILTER_WITHOUT_GATEWAY = "without-gateway";
const KEY_FILTER_ALL = "all";
type KeyFilter = typeof KEY_FILTER_WITHOUT_GATEWAY | typeof KEY_FILTER_ALL;

const KEY_FILTER_OPTIONS: Array<{ value: KeyFilter; label: string }> = [
  { value: KEY_FILTER_WITHOUT_GATEWAY, label: "Without gateway keys" },
  { value: KEY_FILTER_ALL, label: "All API keys" },
];

function filterApiKeysByName(
  apiKeys: ApiKeySettingsTableRow[],
  searchQuery: string,
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  if (normalizedSearch.length === 0) return apiKeys;
  return apiKeys.filter((apiKey) =>
    apiKey.note?.toLowerCase().includes(normalizedSearch),
  );
}

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

  const [searchQuery, setSearchQuery] = useState("");
  const [keyFilter, setKeyFilter] = useState<KeyFilter>(
    KEY_FILTER_WITHOUT_GATEWAY,
  );
  const showKeyFilter = scope === "organization" && SEPARATE_GATEWAY_API_KEYS;

  const projectApiKeys = api.projectApiKeys.byProjectId.useQuery(
    { projectId: entityId },
    { enabled: scope === "project" },
  );
  const organizationApiKeys = api.organizationApiKeys.byOrganizationId.useQuery(
    { orgId: entityId, includeGatewayKeys: keyFilter === KEY_FILTER_ALL },
    { enabled: scope === "organization", placeholderData: keepPreviousData },
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
    return {
      status: "success",
      data: filterApiKeysByName(apiKeys.data ?? [], searchQuery),
    };
  }, [apiKeys.data, apiKeys.isError, apiKeys.isLoading, searchQuery]);

  const deleteApiKey =
    scope === "project" ? deleteProjectApiKey : deleteOrganizationApiKey;

  return (
    <ConnectedApiKeyNameDialogController entityId={entityId} scope={scope}>
      {({ openDialog: openEditNameDialog }) => (
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-80 max-w-full">
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onSubmit={setSearchQuery}
                    placeholder="Search by name"
                  />
                </div>
                {showKeyFilter ? (
                  <div className="w-52">
                    <SelectInput
                      aria-label="Filter API keys"
                      value={keyFilter}
                      options={KEY_FILTER_OPTIONS}
                      muted={keyFilter === KEY_FILTER_WITHOUT_GATEWAY}
                      onValueChange={setKeyFilter}
                      placeholder="Without gateway keys"
                    />
                  </div>
                ) : null}
              </div>
              <ApiKeySettingsTable
                data={tableData}
                editNameAction={{
                  hasAccess: hasWriteAccess,
                  onClick: openEditNameDialog,
                }}
                hasWriteAccess={hasWriteAccess}
                onDelete={openDeleteDialog}
                noResultsMessage={
                  searchQuery.trim().length > 0
                    ? "No API keys match the current search."
                    : "None"
                }
              />
            </div>
          )}
        </ConfirmationDialogController>
      )}
    </ConnectedApiKeyNameDialogController>
  );
}

function ConnectedApiKeyNameDialogController({
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
  const updateProjectApiKey = api.projectApiKeys.updateName.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const updateOrganizationApiKey =
    api.organizationApiKeys.updateName.useMutation({
      onSuccess: () => utils.organizationApiKeys.invalidate(),
    });
  const updateApiKey =
    scope === "project" ? updateProjectApiKey : updateOrganizationApiKey;

  return (
    <DialogController<ApiKeySettingsTableRow & { instance: number }>
      onBeforeClose={() => !updateApiKey.isPending}
      onDismiss={updateApiKey.reset}
      renderDialog={({ state, closeDialog }) => (
        <ApiKeyNameDialog
          key={state.instance}
          apiKey={state}
          error={updateApiKey.error?.message}
          isPending={updateApiKey.isPending}
          onSave={async (name) => {
            try {
              if (scope === "project") {
                await updateProjectApiKey.mutateAsync({
                  projectId: entityId,
                  keyId: state.id,
                  name,
                });
              } else {
                await updateOrganizationApiKey.mutateAsync({
                  orgId: entityId,
                  keyId: state.id,
                  name,
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

function ApiKeyNameDialog({
  apiKey,
  error,
  isPending,
  onSave,
}: {
  apiKey: ApiKeySettingsTableRow;
  error?: string;
  isPending: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const inputId = useId();
  const [name, setName] = useState(apiKey.note ?? "");

  return (
    <Dialog
      title="Edit API key name"
      actions={[
        {
          label: "Save",
          loading: isPending,
          disabled: name === (apiKey.note ?? ""),
          onClick: () => onSave(name),
        },
      ]}
    >
      <Dialog.Body>
        <div className="grid gap-2">
          <label htmlFor={inputId} className="text-sm leading-none font-bold">
            Name
          </label>
          <Input
            id={inputId}
            value={name}
            onChange={(event) => setName(event.target.value)}
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
