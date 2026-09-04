/* eslint-disable @repo/no-null-render */
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Input } from "@/src/components/ui/input";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { SimpleDataTable } from "@/src/components/table/simple-data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { CreateApiKeyButton } from "@/src/features/public-api/components/CreateApiKeyButton";
import {
  useHasOrganizationAccess,
  useHasProjectAccess,
} from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { Check, Copy, TrashIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import startCase from "lodash/startCase";
import { useLangfuseEnvCode } from "@/src/features/public-api/hooks/useLangfuseEnvCode";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";
import { type RouterOutput } from "@/src/utils/types";

type ApiKeyScope = "project" | "organization";
type ApiKeyRow =
  | RouterOutput["projectApiKeys"]["byProjectId"][number]
  | RouterOutput["organizationApiKeys"]["byOrganizationId"][number];
type ApiKeyEntity = { id: string; note: string | null };
type ApiKeyCreator = {
  createdByUser: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  createdByApiKey: { id: string; publicKey: string } | null;
};

export function ApiKeyList(props: { entityId: string; scope: ApiKeyScope }) {
  const { entityId, scope } = props;
  const envCode = useLangfuseEnvCode();

  if (!entityId) {
    throw new Error(
      `${scope}Id is required for ApiKeyList with scope ${scope}`,
    );
  }

  // Viewing the list only needs apiKeys:read, which project MEMBERs hold.
  // Create, delete, and note editing stay behind apiKeys:CUD.
  const hasProjectReadAccess = useHasProjectAccess({
    projectId: props.entityId,
    scope: "apiKeys:read",
  });
  const hasProjectWriteAccess = useHasProjectAccess({
    projectId: props.entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: props.entityId,
    scope: "organization:CRUD_apiKeys",
  });

  const hasAccess =
    props.scope === "project" ? hasProjectReadAccess : hasOrganizationAccess;
  const hasCreateAccess =
    props.scope === "project" ? hasProjectWriteAccess : hasOrganizationAccess;

  const projectApiKeysQuery = api.projectApiKeys.byProjectId.useQuery(
    { projectId: entityId },
    { enabled: hasProjectReadAccess && props.scope === "project" },
  );
  const organizationApiKeysQuery =
    api.organizationApiKeys.byOrganizationId.useQuery(
      { orgId: entityId },
      { enabled: hasOrganizationAccess && props.scope === "organization" },
    );
  const apiKeysQuery =
    props.scope === "project" ? projectApiKeysQuery : organizationApiKeysQuery;

  const columns: LangfuseColumnDef<ApiKeyRow>[] = [
    createTextTableColumn<ApiKeyRow, Date>({
      accessorKey: "createdAt",
      header: "Created",
      mapValue: (value) => value?.toLocaleDateString(),
    }),
    {
      accessorKey: "createdByUser",
      header: "Created By",
      cell: ({ row }) => <ApiKeyCreatedBy apiKey={row.original} />,
    },
    {
      accessorKey: "note",
      header: "Note",
      cell: ({ row }) => (
        <ApiKeyNote apiKey={row.original} entityId={entityId} scope={scope} />
      ),
    },
    {
      accessorKey: "publicKey",
      header: "Public Key",
      cell: ({ row }) => <PublicKeyCell publicKey={row.original.publicKey} />,
    },
    createTextTableColumn<ApiKeyRow>({
      accessorKey: "displaySecretKey",
      header: "Secret Key",
    }),
    {
      accessorKey: "id",
      header: "",
      cell: ({ row }) => (
        <DeleteApiKeyButton
          entityId={entityId}
          apiKeyId={row.original.id}
          scope={scope}
        />
      ),
    },
  ];

  if (!hasAccess) {
    return (
      <div>
        <Header title="API Keys" />
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view API keys for this {scope}.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header
        title={startCase(`${scope} API keys`)}
        help={{
          description: `Learn more about ${scope} API keys`,
          href:
            scope === "project"
              ? "https://langfuse.com/docs/api#authentication"
              : "https://langfuse.com/docs/api#org-scoped-routes",
        }}
        actionButtons={
          hasCreateAccess ? (
            <CreateApiKeyButton entityId={entityId} scope={scope} />
          ) : undefined
        }
      />
      <CodeView
        content={envCode}
        title=".env"
        copiedToClipboardMessage="Secrets are not included, create a new key to copy them."
      />
      <Card className="mb-4 overflow-hidden">
        <SimpleDataTable
          columns={columns}
          data={apiKeysQuery.data ?? []}
          isLoading={apiKeysQuery.isLoading}
          noResults="None"
          bodyTone="muted"
          rowVariant="primary-hover"
        />
      </Card>
    </div>
  );
}

function PublicKeyCell({ publicKey }: { publicKey: string }) {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <div className="relative min-w-0 truncate pr-8 font-mono" title={publicKey}>
      <span>{publicKey}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1/2 right-2 -translate-y-1/2"
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
        onClick={async (event) => {
          event.preventDefault();
          const button = event.currentTarget;
          try {
            await copy(publicKey);
          } catch {
            // Clipboard failures are intentionally silent.
          }
          button.focus();
        }}
      >
        {isCopied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

// show dialog to let user confirm that this is a destructive action
function DeleteApiKeyButton(props: {
  entityId: string;
  apiKeyId: string;
  scope: ApiKeyScope;
}) {
  const { entityId, apiKeyId, scope } = props;
  const capture = usePostHogClientCapture();

  const hasProjectAccess = useHasProjectAccess({
    projectId: props.entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: props.entityId,
    scope: "organization:CRUD_apiKeys",
  });

  const hasAccess =
    props.scope === "project" ? hasProjectAccess : hasOrganizationAccess;

  const utils = api.useUtils();

  const mutDeleteProjectApiKey = api.projectApiKeys.delete.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutDeleteOrgApiKey = api.organizationApiKeys.delete.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [open, setOpen] = useState(false);

  if (!hasAccess) return null;

  const handleDelete = () => {
    if (scope === "project") {
      mutDeleteProjectApiKey
        .mutateAsync({
          projectId: entityId,
          id: apiKeyId,
        })
        .then(() => {
          capture(`${scope}_settings:api_key_delete`);
          setOpen(false);
        })
        .catch((error) => reportNonTrpcError(error, "api-keys"));
    } else {
      mutDeleteOrgApiKey
        .mutateAsync({
          orgId: entityId,
          id: apiKeyId,
        })
        .then(() => {
          capture(`${scope}_settings:api_key_delete`);
          setOpen(false);
        })
        .catch((error) => reportNonTrpcError(error, "api-keys"));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon">
          <TrashIcon className="h-4 w-4" />
        </Button>
      }
      title="Delete API key"
      description="Are you sure you want to delete this API key? This action cannot be undone."
      confirmLabel="Permanently delete"
      loading={mutDeleteOrgApiKey.isPending || mutDeleteProjectApiKey.isPending}
      onConfirm={handleDelete}
    />
  );
}

function ApiKeyCreatedBy({ apiKey }: { apiKey: ApiKeyCreator }) {
  if (apiKey.createdByUser) {
    const { name, email } = apiKey.createdByUser;
    return (
      <span className="truncate" title={email ?? undefined}>
        {name ?? email ?? "Unknown user"}
      </span>
    );
  }
  if (apiKey.createdByApiKey) {
    return (
      <span
        className="truncate font-mono"
        title={`Created via API by key ${apiKey.createdByApiKey.publicKey}`}
      >
        {apiKey.createdByApiKey.publicKey}
      </span>
    );
  }
  return <span>—</span>;
}

function ApiKeyNote({
  apiKey,
  entityId,
  scope,
}: {
  apiKey: ApiKeyEntity;
  entityId: string;
  scope: ApiKeyScope;
}) {
  const utils = api.useUtils();

  const hasProjectAccess = useHasProjectAccess({
    projectId: entityId,
    scope: "apiKeys:CUD",
  });
  const hasOrganizationAccess = useHasOrganizationAccess({
    organizationId: entityId,
    scope: "organization:CRUD_apiKeys",
  });
  const hasEditAccess =
    scope === "project" ? hasProjectAccess : hasOrganizationAccess;

  const mutUpdateProjectApiKey = api.projectApiKeys.updateNote.useMutation({
    onSuccess: () => utils.projectApiKeys.invalidate(),
  });
  const mutUpdateOrgApiKey = api.organizationApiKeys.updateNote.useMutation({
    onSuccess: () => utils.organizationApiKeys.invalidate(),
  });

  const [note, setNote] = useState(apiKey.note ?? "");
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    if (note !== apiKey.note) {
      if (scope === "project") {
        mutUpdateProjectApiKey.mutate({
          projectId: entityId,
          keyId: apiKey.id,
          note,
        });
      } else {
        mutUpdateOrgApiKey.mutate({
          orgId: entityId,
          keyId: apiKey.id,
          note,
        });
      }
    }
  };

  if (!hasEditAccess) return note ?? "";

  if (isEditing) {
    return (
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleBlur}
        autoFocus
        className="h-8"
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="hover:bg-secondary/50 -mx-2 cursor-pointer rounded px-2 py-1"
    >
      {note || "Click to add note"}
    </div>
  );
}
