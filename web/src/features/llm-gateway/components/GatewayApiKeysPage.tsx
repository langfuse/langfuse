import { useState, type ReactNode } from "react";
import { KeyRound, Plus, Trash2, X } from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayApiKeysView } from "@/src/features/llm-gateway/components/GatewayApiKeysView";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function GatewayApiKeysPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const apiKeysQuery = api.llmGateway.listApiKeys.useQuery({
    orgId: organizationId,
  });

  if (apiKeysQuery.isPending) {
    return <ApiKeysSkeleton />;
  }

  if (apiKeysQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Gateway API keys" />
        <Alert variant="destructive">
          <Alert.Title>Gateway API keys could not be loaded</Alert.Title>
          <Alert.Description>
            Retry to manage keys for this organization.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => apiKeysQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <GatewayApiKeysView
      apiKeys={apiKeysQuery.data}
      createAction={
        <CreateGatewayApiKeyDialogController organizationId={organizationId}>
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" />
                Create gateway key
              </Button>
            </Trigger>
          )}
        </CreateGatewayApiKeyDialogController>
      }
      renderRevokeAction={(apiKeyId) => (
        <RevokeGatewayApiKeyDialog
          organizationId={organizationId}
          apiKeyId={apiKeyId}
        />
      )}
    />
  );
}

type MetadataField = {
  id: number;
  key: string;
  value: string;
};

function CreateGatewayApiKeyDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  const [note, setNote] = useState("");
  const [metadata, setMetadata] = useState<MetadataField[]>([]);
  const [nextMetadataId, setNextMetadataId] = useState(1);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    secretKey: string;
  } | null>(null);
  const utils = api.useUtils();
  const create = api.llmGateway.createApiKey.useMutation();

  const reset = () => {
    setNote("");
    setMetadata([]);
    setGeneratedKeys(null);
    setNextMetadataId(1);
  };

  const submit = async () => {
    const metadataObject = Object.fromEntries(
      metadata
        .filter((field) => field.key.trim())
        .map((field) => [field.key.trim(), field.value]),
    );
    try {
      const created = await create.mutateAsync({
        orgId: organizationId,
        note: note.trim() || undefined,
        metadata: metadataObject,
      });
      setGeneratedKeys({
        publicKey: created.publicKey,
        secretKey: created.secretKey,
      });
      await utils.llmGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-api-keys");
    }
  };

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onBeforeClose={() => !create.isPending}
      onDismiss={reset}
      renderContent={() => (
        <>
          <DialogHeader>
            <DialogTitle>
              {generatedKeys
                ? "Gateway API key created"
                : "Create gateway API key"}
            </DialogTitle>
          </DialogHeader>
          {generatedKeys ? (
            <GeneratedKeyContent generatedKeys={generatedKeys} />
          ) : (
            <>
              <DialogBody>
                <div>
                  <Label htmlFor="gateway-key-note">Description</Label>
                  <Input
                    id="gateway-key-note"
                    className="mt-1.5"
                    maxLength={500}
                    placeholder="Production application"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Metadata</Label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMetadata((current) => [
                          ...current,
                          { id: nextMetadataId, key: "", value: "" },
                        ]);
                        setNextMetadataId((current) => current + 1);
                      }}
                    >
                      Add field
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Optional flat key/value pairs made available to gateway
                    routing and ingestion.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {metadata.map((field) => (
                      <div
                        key={field.id}
                        className="ph-no-capture flex items-center gap-2"
                      >
                        <Input
                          aria-label="Metadata key"
                          placeholder="environment"
                          value={field.key}
                          onChange={(event) =>
                            setMetadata((current) =>
                              current.map((item) =>
                                item.id === field.id
                                  ? { ...item, key: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Input
                          aria-label="Metadata value"
                          placeholder="production"
                          value={field.value}
                          onChange={(event) =>
                            setMetadata((current) =>
                              current.map((item) =>
                                item.id === field.id
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Remove metadata field"
                          onClick={() =>
                            setMetadata((current) =>
                              current.filter((item) => item.id !== field.id),
                            )
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                {create.isError ? (
                  <Alert variant="destructive">
                    <Alert.Title>Gateway key could not be created</Alert.Title>
                    <Alert.Description>
                      Check the metadata and try again.
                    </Alert.Description>
                  </Alert>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button
                  loading={create.isPending}
                  disabled={create.isPending}
                  onClick={submit}
                >
                  Create key
                </Button>
              </DialogFooter>
            </>
          )}
        </>
      )}
    >
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}

function GeneratedKeyContent({
  generatedKeys,
}: {
  generatedKeys: { publicKey: string; secretKey: string };
}) {
  return (
    <DialogBody className="ph-no-capture">
      <Alert variant="warning" icon={KeyRound}>
        <Alert.Title>Copy the secret key now</Alert.Title>
        <Alert.Description>
          The secret key is displayed only once and cannot be recovered.
        </Alert.Description>
      </Alert>
      <div>
        <Label>Public key</Label>
        <CodeView content={generatedKeys.publicKey} className="mt-1.5" />
      </div>
      <div>
        <Label>Secret key</Label>
        <CodeView content={generatedKeys.secretKey} className="mt-1.5" />
      </div>
    </DialogBody>
  );
}

function RevokeGatewayApiKeyDialog({
  organizationId,
  apiKeyId,
}: {
  organizationId: string;
  apiKeyId: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const revoke = api.llmGateway.revokeApiKey.useMutation();
  const submit = async () => {
    try {
      await revoke.mutateAsync({ orgId: organizationId, id: apiKeyId });
      await utils.llmGateway.listApiKeys.invalidate({
        orgId: organizationId,
      });
      setOpen(false);
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-api-keys");
    }
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label="Revoke gateway key">
          <Trash2 className="size-4" />
        </Button>
      }
      title="Revoke gateway API key"
      description="Requests using this key will immediately be rejected. This action cannot be undone."
      confirmLabel="Revoke key"
      loading={revoke.isPending}
      onConfirm={submit}
    />
  );
}

function ApiKeysSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="gateway-api-keys-loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
