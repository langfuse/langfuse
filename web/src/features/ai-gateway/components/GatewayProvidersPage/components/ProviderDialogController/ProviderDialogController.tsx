/* eslint-disable no-nested-ternary */
import { useState, type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  children: (control: {
    openAddDialog: () => void;
    openEditDialog: (connection: GatewayConnection) => void;
  }) => ReactNode;
}) {
  const [provider, setProvider] = useState<GatewayProvider>(
    connection?.provider ?? "OPENAI",
  );
  const [name, setName] = useState(connection?.name ?? "");
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const test = api.aiGateway.testConnection.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-providers"),
  });
  const create = api.aiGateway.createConnection.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-providers"),
  });
  const update = api.aiGateway.updateConnection.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-providers"),
  });
  const isSaving = create.isPending || update.isPending;
  const isPending = test.isPending || isSaving;
  const isError = test.isError || create.isError || update.isError;

  const reset = () => {
    setProvider("OPENAI");
    setName("");
    setCredential("");
  };

  const testCredential = async (
    selectedConnection: GatewayConnection | null,
  ) => {
    try {
      await test.mutateAsync({
        orgId: organizationId,
        provider: selectedConnection?.provider ?? provider,
        credential,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const submit = async (
    selectedConnection: GatewayConnection | null,
    closeDialog: () => void,
  ) => {
    try {
      if (selectedConnection) {
        await update.mutateAsync({
          orgId: organizationId,
          id: selectedConnection.id,
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
    <DialogController<GatewayConnection | null>
      size="default"
      closeOnInteractionOutside={false}
      onDismiss={reset}
      onBeforeClose={() => !isPending}
      renderContent={({ state: selectedConnection, closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>
              {selectedConnection
                ? "Edit provider credential"
                : "Add provider credential"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selectedConnection ? (
              <div>
                <Label>Provider</Label>
                <Input
                  className="mt-1.5"
                  value={providerLabels[selectedConnection.provider]}
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
                selectedConnection
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
                  {test.error?.message ??
                    create.error?.message ??
                    update.error?.message ??
                    "The credential could not be saved or validated. Check the key and try again."}
                </Alert.Description>
              </Alert>
            ) : test.isSuccess ? (
              <Alert>
                <Alert.Title>Provider credential is valid</Alert.Title>
                <Alert.Description>No changes were saved.</Alert.Description>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={!credential || isPending}
              loading={test.isPending}
              onClick={() => testCredential(selectedConnection)}
            >
              Test
            </Button>
            <Button
              disabled={
                !name.trim() ||
                (!selectedConnection && !credential) ||
                isPending
              }
              loading={isSaving}
              onClick={() => submit(selectedConnection, closeDialog)}
            >
              Test and save
            </Button>
          </DialogFooter>
        </>
      )}
    >
      {({ openDialog }) =>
        children({
          openAddDialog: () => {
            setProvider(connection?.provider ?? "OPENAI");
            setName(connection?.name ?? "");
            setCredential("");
            openDialog(connection ?? null);
          },
          openEditDialog: (selectedConnection) => {
            setProvider(selectedConnection.provider);
            setName(selectedConnection.name);
            setCredential("");
            openDialog(selectedConnection);
          },
        })
      }
    </DialogController>
  );
}
