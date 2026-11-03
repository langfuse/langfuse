/* eslint-disable no-nested-ternary, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useRef, useState, type ReactNode } from "react";
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
import { Label } from "@/src/components/ui/label";
import { CredentialFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/CredentialFields/CredentialFields";
import { ProviderSelect } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ProviderSelect";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
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
  type RouterOutputs,
} from "@/src/utils/api";
import type { GatewayCredentialSurface } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { getLiveConnectionNameError } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/fns/getLiveConnectionNameError";
import { useExistingConnectionNames } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/hooks/useExistingConnectionNames";

const ROUTE_LABELS: Record<string, string> = {
  "openai.chat-completions": "Chat Completions",
  "openai.responses": "Responses",
  "anthropic.messages": "Messages",
};

/** Routes this client does not know yet show their raw id. */
const routeLabel = (route: string) => ROUTE_LABELS[route] ?? route;

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
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? "");
  const [probeRoutes, setProbeRoutes] =
    useState<RouterOutputs["aiGateway"]["testConnection"]["routes"]>(null);
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

  /** Bumped whenever the tested inputs change, so a result from an earlier
   * run is dropped. */
  const testRun = useRef(0);
  const clearTestResult = () => {
    testRun.current += 1;
    test.reset();
    setProbeRoutes(null);
  };

  const resetMutations = () => {
    clearTestResult();
    create.reset();
    update.reset();
  };

  const reset = () => {
    setProvider("OPENAI");
    setNameDraft(null);
    setCredential("");
    setBaseUrl("");
    resetMutations();
  };

  /** Resetting a pending mutation would re-enable saving mid-request. */
  const clearSaveError = () => {
    if (create.isError) create.reset();
    if (update.isError) update.reset();
  };

  const updateProvider = (value: GatewayProvider) => {
    setProvider(value);
    clearTestResult();
    clearSaveError();
  };

  const updateCredential = (value: string) => {
    setCredential(value);
    clearTestResult();
  };

  const updateName = (value: string) => {
    setNameDraft(value);
    clearSaveError();
  };

  const isCustom = provider === "CUSTOM";

  const testCredential = async (
    selectedConnection: GatewayConnection | null,
  ) => {
    const run = testRun.current;
    try {
      const result = await test.mutateAsync({
        orgId: organizationId,
        provider: selectedConnection?.provider ?? provider,
        credential,
        // With an empty credential the server tests the stored key.
        ...(selectedConnection ? { id: selectedConnection.id } : {}),
        ...(selectedConnection?.provider === "CUSTOM" ||
        (!selectedConnection && isCustom)
          ? // The edited input wins over the stored URL, so Test reports
            // the host that Save would store.
            { baseUrl: baseUrl || selectedConnection?.baseUrl || "" }
          : {}),
      });
      if (run === testRun.current) setProbeRoutes(result.routes);
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
          ...(selectedConnection.provider === "CUSTOM"
            ? { baseUrl: baseUrl || undefined }
            : {}),
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
          ...(isCustom ? { baseUrl } : {}),
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
              {isCustom || selectedConnection?.provider === "CUSTOM" ? (
                <div>
                  <Label htmlFor="gateway-base-url">Base URL</Label>
                  <Input
                    id="gateway-base-url"
                    className="mt-1.5"
                    placeholder="http://ai02.example:8000/v1"
                    value={baseUrl}
                    onChange={(event) => {
                      setBaseUrl(event.target.value);
                      clearTestResult();
                      clearSaveError();
                    }}
                  />
                </div>
              ) : null}
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
                onCredentialChange={updateCredential}
              />
              {probeRoutes && probeRoutes.length > 0 ? (
                <Alert variant="info" icon={Info}>
                  <Alert.Title>Routes detected</Alert.Title>
                  <Alert.Description>
                    This host serves: {probeRoutes.map(routeLabel).join(", ")}.
                    Clients that need another route cannot use this connection.
                  </Alert.Description>
                </Alert>
              ) : null}
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
              ) : test.isSuccess && probeRoutes?.length === 0 ? (
                <Alert variant="warning" icon={TriangleAlert}>
                  <Alert.Title>No supported routes detected</Alert.Title>
                  <Alert.Description>
                    The host answered but serves no Chat Completions, Responses
                    or Messages route. Check the base URL.
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
                disabled={
                  isPending ||
                  (isCustom || selectedConnection?.provider === "CUSTOM"
                    ? !(baseUrl || selectedConnection?.baseUrl || "").trim()
                    : !credential)
                }
                loading={test.isPending}
                onClick={() => testCredential(selectedConnection)}
              >
                Test
              </Button>
              <Button
                disabled={
                  !name.trim() ||
                  Boolean(nameError) ||
                  (!selectedConnection &&
                    (isCustom ? !baseUrl.trim() : !credential)) ||
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
            setBaseUrl("");
            resetMutations();
            openDialog(connection ?? null);
          },
          openEditDialog: (selectedConnection) => {
            setProvider(selectedConnection.provider);
            setNameDraft(selectedConnection.name);
            setCredential("");
            setBaseUrl(selectedConnection.baseUrl ?? "");
            resetMutations();
            openDialog(selectedConnection);
          },
        })
      }
    </DialogController>
  );
}
