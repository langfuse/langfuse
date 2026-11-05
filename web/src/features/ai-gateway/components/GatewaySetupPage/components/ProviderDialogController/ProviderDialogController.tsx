/* eslint-disable no-nested-ternary, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useState, type ReactNode } from "react";
import { Info, TriangleAlert } from "@langfuse/icons";

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
import { BedrockRegionField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/BedrockRegionField/BedrockRegionField";
import { ConnectionNameField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ConnectionNameField/ConnectionNameField";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import { ProviderCardPicker } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ProviderCardPicker/ProviderCardPicker";
import { SecretKeyField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/SecretKeyField/SecretKeyField";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";
import { isGatewayConnectionNameError } from "@/src/features/ai-gateway/fns/isGatewayConnectionNameError";
import { isGatewayHipaaNoticeVisible } from "@/src/features/ai-gateway/fns/isGatewayHipaaNoticeVisible";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
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
import type { GatewayCredentialSurface } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { getLiveConnectionNameError } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/fns/getLiveConnectionNameError";
import { useExistingConnectionNames } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/hooks/useExistingConnectionNames";

export function ProviderDialogController({
  organizationId,
  connection,
  surface,
  onAfterCreate,
  children,
}: {
  organizationId: string;
  connection?: GatewayConnection;
  surface: GatewayCredentialSurface;
  onAfterCreate?: (created: { provider: GatewayProvider }) => void;
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
  const [awsRegion, setAwsRegion] = useState("");
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const existingNames = useExistingConnectionNames(organizationId);
  const { region } = useLangfuseCloudRegion();
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
    ? "Credential validation failed"
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

  /** Bedrock's region is fixed once saved, so edits reuse the stored one. */
  const getConfig = (selectedConnection: GatewayConnection | null) => {
    if ((selectedConnection?.provider ?? provider) !== "BEDROCK") {
      return undefined;
    }
    return selectedConnection?.config ?? { region: awsRegion.trim() };
  };

  const resetMutations = () => {
    test.reset();
    create.reset();
    update.reset();
  };

  const reset = () => {
    setProvider("OPENAI");
    setNameDraft(null);
    setCredential("");
    setAwsRegion("");
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
        config: getConfig(selectedConnection),
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
        capture("ai_gateway:provider_credential_updated", {
          orgId: organizationId,
          provider: selectedConnection.provider,
          isRenamed: name.trim() !== selectedConnection.name,
          isCredentialReplaced: Boolean(credential),
        });
      } else {
        await create.mutateAsync({
          orgId: organizationId,
          provider,
          name,
          credential,
          config: getConfig(null),
        });
        capture("ai_gateway:provider_credential_added", {
          orgId: organizationId,
          surface,
          provider,
          isFirstCredential: existingNames.length === 0,
        });
        onAfterCreate?.({ provider });
      }

      /** Pins the autofilled name so the refetched list cannot bump it to the next suffix. */
      setNameDraft(name);
      await Promise.all([
        utils.aiGateway.listConnections.invalidate({ orgId: organizationId }),
        utils.aiGateway.listModelConnections.invalidate({
          orgId: organizationId,
        }),
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
        const isMissingRegion = getConfig(selectedConnection)?.region === "";
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
              {isGatewayHipaaNoticeVisible(region) ? (
                <Alert variant="info" icon={Info}>
                  <Alert.Title>HIPAA region</Alert.Title>
                  <Alert.Description>
                    Requests are forwarded to the provider you configure, using
                    your credentials and on your instruction. Make sure you have
                    a BAA with that provider before sending PHI.
                  </Alert.Description>
                </Alert>
              ) : null}
              {selectedConnection ? (
                <div>
                  <FieldHeader
                    htmlFor="gateway-provider"
                    label="Provider"
                    description="Fixed once the credential is saved."
                  />
                  <Input
                    id="gateway-provider"
                    value={providerLabels[selectedConnection.provider]}
                    disabled
                  />
                </div>
              ) : (
                <ProviderCardPicker
                  providers={getAvailableGatewayProviders()}
                  value={provider}
                  onChange={updateProvider}
                />
              )}
              <ConnectionNameField
                name={name}
                nameError={nameError}
                onNameChange={updateName}
              />
              {selectedConnection?.config ? (
                <div>
                  <FieldHeader
                    htmlFor="gateway-bedrock-region"
                    label="AWS region"
                    description="Fixed once the credential is saved."
                  />
                  <Input
                    id="gateway-bedrock-region"
                    value={selectedConnection.config.region}
                    disabled
                  />
                </div>
              ) : null}
              {!selectedConnection && provider === "BEDROCK" ? (
                <BedrockRegionField value={awsRegion} onChange={setAwsRegion} />
              ) : null}
              <SecretKeyField
                provider={selectedConnection?.provider ?? provider}
                credential={credential}
                hasSavedKey={Boolean(selectedConnection)}
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
                disabled={!credential || isMissingRegion || isPending}
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
                  isMissingRegion ||
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
            setAwsRegion("");
            resetMutations();
            openDialog(connection ?? null);
          },
          openEditDialog: (selectedConnection) => {
            setProvider(selectedConnection.provider);
            setNameDraft(selectedConnection.name);
            setCredential("");
            setAwsRegion("");
            resetMutations();
            openDialog(selectedConnection);
          },
        })
      }
    </DialogController>
  );
}
