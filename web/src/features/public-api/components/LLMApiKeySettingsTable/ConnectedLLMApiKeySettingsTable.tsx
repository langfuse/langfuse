import { useMemo, type ReactNode } from "react";
import { StringParam, useQueryParam, useQueryParams } from "use-query-params";
import { z } from "zod";
import { LLMAdapter } from "@langfuse/shared";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { CreateLLMApiKeyDialogController } from "@/src/features/public-api/components/CreateLLMApiKeyDialogController";
import { UpdateLLMApiKeyDialog } from "@/src/features/public-api/components/UpdateLLMApiKeyDialog";
import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api, reportNonTrpcError } from "@/src/utils/api";
import {
  LLMApiKeySettingsTable,
  type LLMApiKeySettingsTableRow,
} from "./LLMApiKeySettingsTable";

export function ConnectedLLMApiKeySettingsTable({
  data,
  emptyState,
  owner,
  overriddenProviders,
  toolbarContent,
}: {
  data?: AsyncTableData<LLMApiKeySettingsTableRow[]>;
  emptyState: ReactNode;
  owner: LlmConnectionFormOwner;
  overriddenProviders?: ReadonlySet<string>;
  toolbarContent?: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();

  const hasDeleteAccess = useHasProjectAccess({
    projectId: owner.scope === "project" ? owner.projectId : undefined,
    scope: "llmApiKeys:delete",
  });
  const hasUpdateAccess = useHasProjectAccess({
    projectId: owner.scope === "project" ? owner.projectId : undefined,
    scope: "llmApiKeys:update",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId:
      owner.scope === "organization" ? owner.organizationId : undefined,
    scope: "organizationLlmApiKeys:CUD",
  });
  const canDelete =
    owner.scope === "project" ? hasDeleteAccess : hasOrganizationAccess;
  const canUpdate =
    owner.scope === "project" ? hasUpdateAccess : hasOrganizationAccess;

  const projectApiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: owner.scope === "project" ? owner.projectId : "",
      includeDecisionModels: true,
    },
    { enabled: owner.scope === "project" && data === undefined },
  );
  const organizationApiKeys = api.organizationLlmApiKey.all.useQuery(
    {
      orgId: owner.scope === "organization" ? owner.organizationId : "",
      includeDecisionModels: true,
    },
    { enabled: owner.scope === "organization" && data === undefined },
  );
  const apiKeys =
    owner.scope === "project" ? projectApiKeys : organizationApiKeys;
  const deleteProjectApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });
  const deleteOrganizationApiKey = api.organizationLlmApiKey.delete.useMutation(
    {
      onSuccess: async () => {
        await Promise.all([
          utils.organizationLlmApiKey.invalidate(),
          utils.llmApiKey.invalidate(),
        ]);
      },
    },
  );

  const queriedTableData = useMemo<
    AsyncTableData<LLMApiKeySettingsTableRow[]>
  >(() => {
    if (apiKeys.isLoading) return { status: "loading" };
    if (apiKeys.isError) {
      return { status: "error", error: "Failed to load LLM connections" };
    }

    return {
      status: "success",
      data: apiKeys.data?.data ?? [],
    };
  }, [apiKeys.data?.data, apiKeys.isError, apiKeys.isLoading]);
  const tableData = data ?? queriedTableData;
  const tableDataWithOverrides = useMemo<
    AsyncTableData<LLMApiKeySettingsTableRow[]>
  >(() => {
    if (tableData.status !== "success" || !overriddenProviders) {
      return tableData;
    }
    return {
      status: "success",
      data: tableData.data.map((apiKey) => ({
        ...apiKey,
        overriddenByProject: overriddenProviders.has(apiKey.provider),
      })),
    };
  }, [overriddenProviders, tableData]);

  // `?editConnection=<id>` opens the edit dialog of that connection, e.g. from
  // a link that asks the user to replace a rejected API key.
  const [editConnectionId, setEditConnectionId] = useQueryParam(
    "editConnection",
    StringParam,
  );
  const editTarget =
    canUpdate && tableDataWithOverrides.status === "success"
      ? tableDataWithOverrides.data.find(
          (apiKey) => apiKey.id === editConnectionId,
        )
      : undefined;
  const clearEditConnection = () => {
    if (editConnectionId) setEditConnectionId(undefined, "replaceIn");
  };

  // `?createConnection=<name>&adapter=<adapter>` opens the create dialog of
  // the project table with that name, e.g. from a link that asks the user to
  // add a missing connection.
  const [createConnection, setCreateConnection] = useQueryParams({
    createConnection: StringParam,
    adapter: StringParam,
  });
  const createPrefill =
    owner.scope === "project" && createConnection.createConnection
      ? {
          provider: createConnection.createConnection,
          adapter: z.enum(LLMAdapter).safeParse(createConnection.adapter).data,
        }
      : undefined;
  const clearCreateConnection = () => {
    if (createPrefill) {
      setCreateConnection(
        { createConnection: undefined, adapter: undefined },
        "replaceIn",
      );
    }
  };

  const handleDeleteDismiss = () => {
    deleteProjectApiKey.reset();
    deleteOrganizationApiKey.reset();
  };

  const handleDeleteConfirm = async (apiKey: { id: string }) => {
    try {
      if (owner.scope === "project") {
        await deleteProjectApiKey.mutateAsync({
          projectId: owner.projectId,
          id: apiKey.id,
        });
        capture("project_settings:llm_api_key_delete");
      } else {
        await deleteOrganizationApiKey.mutateAsync({
          orgId: owner.organizationId,
          id: apiKey.id,
        });
        capture("organization_settings:llm_api_key_delete");
      }
    } catch (error) {
      reportNonTrpcError(error, "llm-api-keys");
      throw error;
    }
  };

  return (
    <CreateLLMApiKeyDialogController
      owner={owner}
      initialPrefill={createPrefill}
      onAfterClose={clearCreateConnection}
    >
      {({ hasAccess: hasCreateAccess, openDialog: openCreateDialog }) => (
        <UpdateLLMApiKeyDialog
          // Remounts once the linked connection has loaded, so it opens.
          key={editTarget?.id}
          owner={owner}
          initialApiKey={editTarget}
          onAfterClose={clearEditConnection}
        >
          {({ openDialog: openUpdateDialog }) => (
            <ConfirmationDialogController<{ id: string }>
              title="Delete LLM Connection"
              text="Are you sure you want to delete this connection? This action cannot be undone."
              confirmLabel="Permanently delete"
              variant="destructive"
              loading={
                deleteProjectApiKey.isPending ||
                deleteOrganizationApiKey.isPending
              }
              error={
                deleteProjectApiKey.error?.message ??
                deleteOrganizationApiKey.error?.message
              }
              onAfterDismiss={handleDeleteDismiss}
              onConfirm={handleDeleteConfirm}
            >
              {({ openDialog: openDeleteDialog }) => (
                <LLMApiKeySettingsTable
                  actionsDisabledReason={
                    owner.scope === "organization" && !canUpdate && !canDelete
                      ? "Only organization owners and admins can modify organization connections."
                      : undefined
                  }
                  createAction={{
                    hasAccess: hasCreateAccess,
                    label:
                      owner.scope === "project"
                        ? "Project Connection"
                        : "Organization Connection",
                    onClick: openCreateDialog,
                  }}
                  deleteAction={{
                    hasAccess: canDelete,
                    onClick: openDeleteDialog,
                  }}
                  updateAction={{
                    hasAccess: canUpdate,
                    onClick: openUpdateDialog,
                  }}
                  data={tableDataWithOverrides}
                  emptyState={emptyState}
                  toolbarContent={toolbarContent}
                  tableName={
                    owner.scope === "project"
                      ? "Project LLM connections"
                      : "Organization LLM connections"
                  }
                />
              )}
            </ConfirmationDialogController>
          )}
        </UpdateLLMApiKeyDialog>
      )}
    </CreateLLMApiKeyDialogController>
  );
}
