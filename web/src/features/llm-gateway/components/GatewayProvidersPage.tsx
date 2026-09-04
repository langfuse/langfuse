import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayProvidersView } from "@/src/features/llm-gateway/components/GatewayProvidersView";
import { api, reportNonTrpcError, type RouterOutputs } from "@/src/utils/api";

type GatewayProvider = "OPENAI" | "ANTHROPIC" | "OPENROUTER";
type Connection = RouterOutputs["llmGateway"]["listConnections"][number];

const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  OPENROUTER: "OpenRouter",
};

export function GatewayProvidersPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const connectionsQuery = api.llmGateway.listConnections.useQuery({
    orgId: organizationId,
  });
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});

  if (connectionsQuery.isPending) {
    return <ProvidersSkeleton />;
  }

  if (connectionsQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Provider credentials" />
        <Alert variant="destructive">
          <Alert.Title>Provider credentials could not be loaded</Alert.Title>
          <Alert.Description>
            Retry to manage gateway routing credentials.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => connectionsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const connections = connectionsQuery.data;
  return (
    <GatewayProvidersView
      connections={connections}
      modelCounts={modelCounts}
      createAction={
        <CreateProviderDialogController organizationId={organizationId}>
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>
                <Plus className="mr-1.5 size-4" />
                Add credential
              </Button>
            </Trigger>
          )}
        </CreateProviderDialogController>
      }
      renderPriorityActions={(_connection, index) => (
        <>
          <ReorderButton
            organizationId={organizationId}
            connections={connections}
            index={index}
            direction="up"
          />
          <ReorderButton
            organizationId={organizationId}
            connections={connections}
            index={index}
            direction="down"
          />
        </>
      )}
      renderCredentialActions={(_connection, index) => {
        const connection = connections[index];
        if (!connection) return null;
        return (
          <>
            <RetryProviderButton
              organizationId={organizationId}
              connectionId={connection.id}
              onModelsLoaded={(count) =>
                setModelCounts((current) => ({
                  ...current,
                  [connection.id]: count,
                }))
              }
            />
            <EditProviderDialogController
              organizationId={organizationId}
              connection={connection}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Edit credential"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </Trigger>
              )}
            </EditProviderDialogController>
            <DeleteProviderDialog
              organizationId={organizationId}
              connection={connection}
            />
          </>
        );
      }}
    />
  );
}

function ReorderButton({
  organizationId,
  connections,
  index,
  direction,
}: {
  organizationId: string;
  connections: Connection[];
  index: number;
  direction: "up" | "down";
}) {
  const utils = api.useUtils();
  const reorder = api.llmGateway.reorderConnections.useMutation();
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  const disabled =
    reorder.isPending || targetIndex < 0 || targetIndex >= connections.length;
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  const move = async () => {
    const connectionIds = connections.map((connection) => connection.id);
    [connectionIds[index], connectionIds[targetIndex]] = [
      connectionIds[targetIndex],
      connectionIds[index],
    ];
    try {
      await reorder.mutateAsync({ orgId: organizationId, connectionIds });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      disabled={disabled}
      aria-label={`Move credential ${direction}`}
      onClick={move}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function RetryProviderButton({
  organizationId,
  connectionId,
  onModelsLoaded,
}: {
  organizationId: string;
  connectionId: string;
  onModelsLoaded: (count: number) => void;
}) {
  const utils = api.useUtils();
  const retry = api.llmGateway.retryConnection.useMutation();

  const retryConnection = async () => {
    try {
      const result = await retry.mutateAsync({
        orgId: organizationId,
        id: connectionId,
      });
      if (result.success) onModelsLoaded(result.models.length);
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      loading={retry.isPending}
      aria-label="Retry provider validation"
      onClick={retryConnection}
    >
      <RefreshCw className="size-4" />
    </Button>
  );
}

function CreateProviderDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  const [provider, setProvider] = useState<GatewayProvider>("OPENAI");
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const create = api.llmGateway.createConnection.useMutation();

  const reset = () => {
    setProvider("OPENAI");
    setName("");
    setCredential("");
  };

  const submit = async (closeDialog: () => void) => {
    try {
      await create.mutateAsync({
        orgId: organizationId,
        provider,
        name,
        credential,
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      closeDialog();
      reset();
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onDismiss={reset}
      onBeforeClose={() => !create.isPending}
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>Add provider credential</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <ProviderSelect value={provider} onChange={setProvider} />
            <CredentialFields
              name={name}
              credential={credential}
              credentialPlaceholder="Enter secret key"
              onNameChange={setName}
              onCredentialChange={setCredential}
            />
            {create.isError ? (
              <Alert variant="destructive">
                <Alert.Title>Provider validation failed</Alert.Title>
                <Alert.Description>
                  The credential could not be saved or validated. Check the key
                  and try again.
                </Alert.Description>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={!name.trim() || !credential || create.isPending}
              loading={create.isPending}
              onClick={() => submit(closeDialog)}
            >
              Test and save
            </Button>
          </DialogFooter>
        </>
      )}
    >
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}

function EditProviderDialogController({
  organizationId,
  connection,
  children,
}: {
  organizationId: string;
  connection: Connection;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      renderContent={({ closeDialog }) => (
        <EditProviderForm
          key={`${connection.id}:${connection.updatedAt.toISOString()}`}
          organizationId={organizationId}
          connection={connection}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ Trigger }) => children({ Trigger })}
    </DialogController>
  );
}

function EditProviderForm({
  organizationId,
  connection,
  closeDialog,
}: {
  organizationId: string;
  connection: Connection;
  closeDialog: () => void;
}) {
  const [name, setName] = useState(connection.name);
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const update = api.llmGateway.updateConnection.useMutation();

  const submit = async () => {
    try {
      await update.mutateAsync({
        orgId: organizationId,
        id: connection.id,
        name,
        ...(credential ? { credential } : {}),
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      closeDialog();
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit provider credential</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div>
          <Label>Provider</Label>
          <Input
            className="mt-1.5"
            value={providerLabels[connection.provider]}
            disabled
          />
        </div>
        <CredentialFields
          name={name}
          credential={credential}
          credentialPlaceholder="Leave blank to keep current key"
          onNameChange={setName}
          onCredentialChange={setCredential}
        />
        {update.isError ? (
          <Alert variant="destructive">
            <Alert.Title>Provider validation failed</Alert.Title>
            <Alert.Description>
              The credential could not be saved or validated. Check the key and
              try again.
            </Alert.Description>
          </Alert>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button
          disabled={!name.trim() || update.isPending}
          loading={update.isPending}
          onClick={submit}
        >
          Test and save
        </Button>
      </DialogFooter>
    </>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: GatewayProvider;
  onChange: (provider: GatewayProvider) => void;
}) {
  return (
    <div>
      <Label htmlFor="gateway-provider">Provider</Label>
      <Select
        value={value}
        onValueChange={(provider) => onChange(provider as GatewayProvider)}
      >
        <SelectTrigger id="gateway-provider" className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(providerLabels).map(([provider, label]) => (
            <SelectItem key={provider} value={provider}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CredentialFields({
  name,
  credential,
  credentialPlaceholder,
  onNameChange,
  onCredentialChange,
}: {
  name: string;
  credential: string;
  credentialPlaceholder: string;
  onNameChange: (name: string) => void;
  onCredentialChange: (credential: string) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="gateway-credential-name">Name</Label>
        <Input
          id="gateway-credential-name"
          className="mt-1.5"
          placeholder="Production"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="ph-no-capture">
        <Label htmlFor="gateway-secret-key">Secret key</Label>
        <Input
          id="gateway-secret-key"
          className="mt-1.5"
          type="password"
          autoComplete="new-password"
          placeholder={credentialPlaceholder}
          value={credential}
          onChange={(event) => onCredentialChange(event.target.value)}
        />
      </div>
    </>
  );
}

function DeleteProviderDialog({
  organizationId,
  connection,
}: {
  organizationId: string;
  connection: Connection;
}) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const remove = api.llmGateway.deleteConnection.useMutation();
  const deleteConnection = async () => {
    try {
      await remove.mutateAsync({
        orgId: organizationId,
        id: connection.id,
      });
      await utils.llmGateway.listConnections.invalidate({
        orgId: organizationId,
      });
      setOpen(false);
    } catch (error) {
      reportNonTrpcError(error, "llm-gateway-providers");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label="Delete credential">
          <Trash2 className="size-4" />
        </Button>
      }
      title="Delete provider credential"
      description={`Delete “${connection.name}”? Requests will immediately stop using it.`}
      confirmLabel="Delete credential"
      loading={remove.isPending}
      onConfirm={deleteConnection}
    />
  );
}

function ProvidersSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-providers-loading"
    >
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
