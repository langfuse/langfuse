import { useMemo } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { CreateLLMApiKeyDialogController } from "@/src/features/public-api/components/CreateLLMApiKeyDialogController";
import { UpdateLLMApiKeyDialog } from "@/src/features/public-api/components/UpdateLLMApiKeyDialog";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, reportNonTrpcError } from "@/src/utils/api";
import {
  LLMApiKeySettingsTable,
  type LLMApiKeySettingsTableRow,
} from "./LLMApiKeySettingsTable";

export function ConnectedLLMApiKeySettingsTable({
  projectId,
}: {
  projectId: string;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();

  const hasDeleteAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:delete",
  });
  const hasUpdateAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });

  const apiKeys = api.llmApiKey.all.useQuery({ projectId });
  const deleteApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });

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
    <CreateLLMApiKeyDialogController projectId={projectId}>
      {({ hasAccess: hasCreateAccess, openDialog: openCreateDialog }) => (
        <UpdateLLMApiKeyDialog projectId={projectId}>
          {({ openDialog: openUpdateDialog }) => (
            <ConfirmationDialogController<{ id: string }>
              title="Delete LLM Connection"
              text="Are you sure you want to delete this connection? This action cannot be undone."
              confirmLabel="Permanently delete"
              variant="destructive"
              loading={deleteApiKey.isPending}
              error={deleteApiKey.error?.message}
              onAfterDismiss={deleteApiKey.reset}
              onConfirm={async (apiKey) => {
                try {
                  await deleteApiKey.mutateAsync({ projectId, id: apiKey.id });
                  capture("project_settings:llm_api_key_delete");
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
                    hasAccess: hasDeleteAccess,
                    onClick: openDeleteDialog,
                  }}
                  updateAction={{
                    hasAccess: hasUpdateAccess,
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
