/* eslint-disable no-nested-ternary */
import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

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
import { isGatewayConnectionNameError } from "@/src/features/ai-gateway/fns/isGatewayConnectionNameError";
import { suggestGatewayConnectionName } from "@/src/features/ai-gateway/fns/suggestGatewayConnectionName";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import { getLiveConnectionNameError } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/fns/getLiveConnectionNameError";
import { useExistingConnectionNames } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/hooks/useExistingConnectionNames";

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
  /** `null` until the user types, so the name follows the provider's suggestion. */
  const [nameDraft, setNameDraft] = useState<string | null>(
    connection?.name ?? null,
  );
  const [credential, setCredential] = useState("");
  const utils = api.useUtils();
  const existingNames = useExistingConnectionNames(organizationId);
  const name =
    nameDraft ?? suggestGatewayConnectionName(provider, existingNames);
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
  /** Stays true until reset, while the dialog awaits the list refetch before closing. */
  const isSaved = create.isSuccess || update.isSuccess;
  const isPending = test.isPending || isSaving;
  const saveError = create.error ?? update.error;
  const serverNameError =
    saveError && isGatewayConnectionNameError(saveError.message)
      ? saveError.message
      : null;
  const isError = test.isError || (Boolean(saveError) && !serverNameError);
  const errorTitle = test.isError
    ? "Provider validation failed"
    : "Provider credential could not be saved";

  /** Skips the live check after saving, as the refetched list already holds the saved name. */
  const getNameError = (selectedConnection: GatewayConnection | null) =>
    isSaved
      ? null
      : (getLiveConnectionNameError({
          name,
          currentName: selectedConnection?.name,
          existingNames,
        }) ?? serverNameError);

  const resetMutations = () => {
    test.reset();
    create.reset();
    update.reset();
  };

  const reset = () => {
    setProvider("OPENAI");
    setNameDraft(null);
    setCredential("");
    resetMutations();
  };

  /** Resetting a pending mutation would re-enable saving mid-request. */
  const clearSaveError = () => {
    if (create.isError) create.reset();
    if (update.isError) update.reset();
  };

  const updateProvider = (value: GatewayProvider) => {
    setProvider(value);
    clearSaveError();
  };

  const updateName = (value: string) => {
    setNameDraft(value);
    clearSaveError();
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

      /** Pins the autofilled name so the refetched list cannot bump it to the next suffix. */
      setNameDraft(name);
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
      renderContent={({ state: selectedConnection, closeDialog }) => {
        const nameError = getNameError(selectedConnection);
        return (
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
                <ProviderSelect value={provider} onChange={updateProvider} />
              )}
              <CredentialFields
                name={name}
                nameError={nameError}
                credential={credential}
                credentialPlaceholder={
                  selectedConnection
                    ? "Leave blank to keep current key"
                    : "Enter secret key"
                }
                onNameChange={updateName}
                onCredentialChange={setCredential}
              />
              {selectedConnection && name.trim() !== selectedConnection.name ? (
                <Alert variant="warning" icon={TriangleAlert}>
                  <Alert.Title>Renaming changes model slugs</Alert.Title>
                  <Alert.Description>
                    Requests using model slugs with the old connection name will
                    stop resolving.
                  </Alert.Description>
                </Alert>
              ) : null}
              {isError ? (
                <Alert variant="destructive">
                  <Alert.Title>{errorTitle}</Alert.Title>
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
                  Boolean(nameError) ||
                  (!selectedConnection && !credential) ||
                  isPending ||
                  isSaved
                }
                loading={isSaving}
                onClick={() => submit(selectedConnection, closeDialog)}
              >
                Test and save
              </Button>
            </DialogFooter>
          </>
        );
      }}
    >
      {({ openDialog }) =>
        children({
          openAddDialog: () => {
            setProvider(connection?.provider ?? "OPENAI");
            setNameDraft(connection?.name ?? null);
            setCredential("");
            resetMutations();
            openDialog(connection ?? null);
          },
          openEditDialog: (selectedConnection) => {
            setProvider(selectedConnection.provider);
            setNameDraft(selectedConnection.name);
            setCredential("");
            resetMutations();
            openDialog(selectedConnection);
          },
        })
      }
    </DialogController>
  );
}
