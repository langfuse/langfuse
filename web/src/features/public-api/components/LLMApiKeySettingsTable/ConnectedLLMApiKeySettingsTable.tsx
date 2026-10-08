import { useMemo, type ReactNode } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { CreateLLMApiKeyDialogController } from "@/src/features/public-api/components/CreateLLMApiKeyDialogController";
import { UpdateLLMApiKeyDialog } from "@/src/features/public-api/components/UpdateLLMApiKeyDialog";
import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import {
  useHasOrganizationAccess,
  useHasProjectAccess,
} from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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

  return (
    <CreateLLMApiKeyDialogController owner={owner}>
      {({ hasAccess: hasCreateAccess, openDialog: openCreateDialog }) => (
        <UpdateLLMApiKeyDialog owner={owner}>
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
              onAfterDismiss={() => {
                deleteProjectApiKey.reset();
                deleteOrganizationApiKey.reset();
              }}
              onConfirm={async (apiKey) => {
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
              }}
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
