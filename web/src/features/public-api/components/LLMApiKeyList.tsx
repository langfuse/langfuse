import { useHasProjectAccess } from "@/src/features/rbac";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { SimpleDataTable } from "@/src/components/table/simple-data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CreateLLMApiKeyDialog } from "./CreateLLMApiKeyDialog";
import { UpdateLLMApiKeyDialog } from "./UpdateLLMApiKeyDialog";
import { type RouterOutput } from "@/src/utils/types";

type LlmApiKeyRow = RouterOutput["llmApiKey"]["all"]["data"][number];

export function LlmApiKeyList(props: { projectId: string }) {
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const hasAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:read",
  });
  const hasDeleteAccess = useHasProjectAccess({
    projectId: props.projectId,
    scope: "llmApiKeys:delete",
  });

  const apiKeys = api.llmApiKey.all.useQuery(
    {
      projectId: props.projectId,
    },
    {
      enabled: hasAccess,
    },
  );

  const hasExtraHeaderKeys = apiKeys.data?.data.some(
    (key) => key.extraHeaderKeys.length > 0,
  );

  const columns: LangfuseColumnDef<LlmApiKeyRow>[] = [
    createTextTableColumn<LlmApiKeyRow>({
      accessorKey: "provider",
      header: "Provider",
    }),
    createTextTableColumn<LlmApiKeyRow>({
      accessorKey: "adapter",
      header: "Adapter",
    }),
    createTextTableColumn<LlmApiKeyRow>({
      accessorKey: "baseURL",
      header: "Base URL",
      mapValue: (value) => value ?? "default",
    }),
    createTextTableColumn<LlmApiKeyRow>({
      accessorKey: "displaySecretKey",
      header: "API Key",
    }),
    ...(hasExtraHeaderKeys
      ? [
          createTextTableColumn<LlmApiKeyRow, string[]>({
            accessorKey: "extraHeaderKeys",
            header: "Extra headers",
            mapValue: (value) => value?.join(", "),
          }),
        ]
      : []),
    {
      accessorKey: "id",
      header: "",
      cell: ({ row }) => {
        const apiKey = row.original;
        return (
          <div
            className="flex justify-end space-x-2"
            onClick={(event) => event.stopPropagation()}
          >
            <UpdateLLMApiKeyDialog
              apiKey={apiKey}
              projectId={props.projectId}
              open={editingKeyId === apiKey.id}
              onOpenChange={(open: boolean) => {
                if (open) {
                  setEditingKeyId(apiKey.id);
                } else {
                  setEditingKeyId(null);
                }
              }}
            />
            {hasDeleteAccess && (
              <DeleteApiKeyButton
                projectId={props.projectId}
                apiKeyId={apiKey.id}
              />
            )}
          </div>
        );
      },
    },
  ];

  if (!hasAccess) {
    return (
      <div>
        <Header title="LLM Connections" />
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view LLM API keys for this project.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div id="llm-api-keys">
      <Header title="LLM Connections" />
      <p className="mb-4 text-sm">
        Connect your LLM services to enable evaluations and playground features.
        Your provider will charge based on usage.
      </p>
      <Card className="mb-4 overflow-auto">
        <SimpleDataTable
          columns={columns}
          data={apiKeys.data?.data ?? []}
          isLoading={apiKeys.isLoading}
          noResults="None"
          bodyTone="muted"
          rowVariant="primary-hover-static"
          onRowClick={(apiKey) => setEditingKeyId(apiKey.id)}
        />
      </Card>
      <CreateLLMApiKeyDialog open={open} setOpen={setOpen} />
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: { projectId: string; apiKeyId: string }) {
  const capture = usePostHogClientCapture();

  const utils = api.useUtils();
  const mutDeleteApiKey = api.llmApiKey.delete.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });
  const [open, setOpen] = useState(false);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon">
          <TrashIcon className="h-4 w-4" />
        </Button>
      }
      title="Delete LLM Connection"
      description="Are you sure you want to delete this connection? This action cannot be undone."
      confirmLabel="Permanently delete"
      loading={mutDeleteApiKey.isPending}
      onConfirm={() => {
        mutDeleteApiKey
          .mutateAsync({
            projectId: props.projectId,
            id: props.apiKeyId,
          })
          .then(() => {
            capture("project_settings:llm_api_key_delete");
            setOpen(false);
          })
          .catch((error) => reportNonTrpcError(error, "llm-api-keys"));
      }}
    />
  );
}
