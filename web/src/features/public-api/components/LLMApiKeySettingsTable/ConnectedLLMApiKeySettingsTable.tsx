import { useMemo } from "react";

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
  owner,
}: {
  owner: LlmConnectionFormOwner;
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
    { enabled: owner.scope === "project" },
  );
  const organizationApiKeys = api.organizationLlmApiKey.all.useQuery(
    {
      orgId: owner.scope === "organization" ? owner.organizationId : "",
      includeDecisionModels: true,
    },
    { enabled: owner.scope === "organization" },
  );
  const apiKeys =
    owner.scope === "project" ? projectApiKeys : organizationApiKeys;
  const deleteProjectApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });
  const deleteOrganizationApiKey = api.organizationLlmApiKey.delete.useMutation(
    {
      onSuccess: () => utils.organizationLlmApiKey.invalidate(),
    },
  );

  const tableData = useMemo<AsyncTableData<LLMApiKeySettingsTableRow[]>>(() => {
    if (apiKeys.isLoading) return { status: "loading" };
    if (apiKeys.isError) {
      return { status: "error", error: "Failed to load LLM connections" };
    }

    return {
      status: "success",
      data: apiKeys.data?.data ?? [],
    };
  }, [apiKeys.data?.data, apiKeys.isError, apiKeys.isLoading]);

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
                  createAction={{
                    hasAccess: hasCreateAccess,
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
                  data={tableData}
                  noResultsMessage="None"
                />
              )}
            </ConfirmationDialogController>
          )}
        </UpdateLLMApiKeyDialog>
      )}
    </CreateLLMApiKeyDialogController>
  );
}
