import { useState, type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
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
import { CredentialFields } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/CredentialFields";
import { ProviderSelect } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderSelect";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

export function ProviderDialogController({
  organizationId,
  connection,
  children,
}: {
  organizationId: string;
  connection?: GatewayConnection;
  children: (control: { Trigger: typeof DialogTrigger }) => ReactNode;
}) {
  const [provider, setProvider] = useState<GatewayProvider>(
    connection?.provider ?? "OPENAI",
  );
  const [name, setName] = useState(connection?.name ?? "");
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const create = api.aiGateway.createConnection.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-providers"),
  });
  const update = api.aiGateway.updateConnection.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-providers"),
  });
  const isPending = create.isPending || update.isPending;
  const isError = create.isError || update.isError;

  const reset = () => {
    setProvider(connection?.provider ?? "OPENAI");
    setName(connection?.name ?? "");
    setCredential("");
  };

  const submit = async (closeDialog: () => void) => {
    try {
      if (connection) {
        await update.mutateAsync({
          orgId: organizationId,
          id: connection.id,
          name,
          ...(credential ? { credential } : {}),
        });
      } else {
        await create.mutateAsync({
          orgId: organizationId,
          provider,
          name,
          credential,
        });
      }

      await Promise.all([
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.refreshModels.invalidate({ orgId: organizationId }),
      ]);
      closeDialog();
      reset();
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onDismiss={reset}
      onBeforeClose={() => !isPending}
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>
              {connection
                ? "Edit provider credential"
                : "Add provider credential"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {connection ? (
              <div>
                <Label>Provider</Label>
                <Input
                  className="mt-1.5"
                  value={providerLabels[connection.provider]}
                  disabled
                />
              </div>
            ) : (
              <ProviderSelect value={provider} onChange={setProvider} />
            )}
            <CredentialFields
              name={name}
              credential={credential}
              credentialPlaceholder={
                connection
                  ? "Leave blank to keep current key"
                  : "Enter secret key"
              }
              onNameChange={setName}
              onCredentialChange={setCredential}
            />
            {isError ? (
              <Alert variant="destructive">
                <Alert.Title>Provider validation failed</Alert.Title>
                <Alert.Description>
                  {create.error?.message ??
                    update.error?.message ??
                    "The credential could not be saved or validated. Check the key and try again."}
                </Alert.Description>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={
                !name.trim() || (!connection && !credential) || isPending
              }
              loading={isPending}
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
