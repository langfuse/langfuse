/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useState, type ReactNode } from "react";
import { type MutationStatus } from "@tanstack/react-query";
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
import {
  AdvancedSettings,
  type ExtraHeaderRow,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/AdvancedSettings/AdvancedSettings";
import {
  AzureResourceField,
  type AzureResourceFieldValue,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/AzureResourceField/AzureResourceField";
import { ConnectionTestStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ConnectionTestStatus/ConnectionTestStatus";
import { type ConnectionTestFailure } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ConnectionTestStatus/components/ConnectionTestDetails/ConnectionTestDetails";
import { ConnectionNameField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ConnectionNameField/ConnectionNameField";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import { RegionField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/RegionField/RegionField";
import { ProviderSelect } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/ProviderSelect";
import { SecretKeyField } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/SecretKeyField/SecretKeyField";
import { bedrockRegionGroups } from "@/src/features/ai-gateway/constants/bedrockRegions";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { vertexLocationGroups } from "@/src/features/ai-gateway/constants/vertexLocations";
import { ModelListingDeniedAlert } from "@/src/features/ai-gateway/components/ModelListingDeniedAlert/ModelListingDeniedAlert";
import { showToast } from "@/src/features/notifications/showToast";
import {
  getAzureResource,
  getAzureResourceEndpoint,
  isAzureProjectName,
  isAzureResourceName,
} from "@/src/features/ai-gateway/fns/azureResource";
import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";
import { supportsCustomEndpoint } from "@/src/features/ai-gateway/fns/supportsCustomEndpoint";
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

const EMPTY_AZURE_RESOURCE: AzureResourceFieldValue = { name: "", project: "" };
const DEFAULT_VERTEX_LOCATION = "global";
const BEDROCK_REGION_FIELD = {
  id: "gateway-bedrock-region",
  label: "AWS region",
};
const VERTEX_LOCATION_FIELD = {
  id: "gateway-vertex-location",
  label: "Location",
};

function getStoredRegionField(
  config: { region: string } | { location: string },
) {
  return "region" in config
    ? { ...BEDROCK_REGION_FIELD, value: config.region }
    : { ...VERTEX_LOCATION_FIELD, value: config.location };
}

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
    /** Opens the add dialog with this provider selected. */
    openAddDialogFor: (provider: GatewayProvider) => void;
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
  const [vertexLocation, setVertexLocation] = useState(DEFAULT_VERTEX_LOCATION);
  const [baseURL, setBaseURL] = useState("");
  const [azureResource, setAzureResource] =
    useState<AzureResourceFieldValue>(EMPTY_AZURE_RESOURCE);
  const [extraHeaders, setExtraHeaders] = useState<ExtraHeaderRow[]>([]);
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
  const isSaveError = Boolean(saveError) && !serverNameError;
  const testOutcome = getTestOutcome(test);

  /** Skips the live check after saving, as the refetched list already holds the saved name. */
  const getNameError = (selectedConnection: GatewayConnection | null) =>
    isSaved
      ? null
      : (getLiveConnectionNameError({
          name,
          currentName: selectedConnection?.name,
          existingNames,
        }) ?? serverNameError);

  /** Bedrock's region and Vertex AI's location are fixed once saved, so edits reuse the stored one. */
  const getConfig = (selectedConnection: GatewayConnection | null) => {
    if (selectedConnection) return selectedConnection.config ?? undefined;
    if (provider === "BEDROCK") return { region: awsRegion.trim() };
    if (provider === "VERTEX") return { location: vertexLocation };
    return undefined;
  };

  /**
   * Bedrock, xAI, Vercel, Google AI Studio and Vertex AI have no custom
   * endpoint, and Azure only the endpoint of its resource and project.
   * When editing, a blank header value keeps the stored value, so those rows
   * are sent; a new connection has no stored values and drops them.
   */
  const getEndpoint = (selectedConnection: GatewayConnection | null) => {
    const selectedProvider = selectedConnection?.provider ?? provider;
    if (selectedProvider === "AZURE") {
      return {
        baseURL: isValidAzureResource(azureResource)
          ? getAzureResourceEndpoint(azureResource)
          : null,
      };
    }
    if (!supportsCustomEndpoint(selectedProvider)) {
      return {};
    }
    const headers = extraHeaders.filter(
      (header) =>
        header.key.trim() && (selectedConnection !== null || header.value),
    );
    return {
      baseURL: baseURL.trim() || null,
      extraHeaders: Object.fromEntries(
        headers.map((header) => [header.key.trim(), header.value]),
      ),
    };
  };

  const loadEndpoint = (selectedConnection: GatewayConnection | null) => {
    setBaseURL(selectedConnection?.baseURL ?? "");
    const resource = getAzureResource(selectedConnection?.baseURL ?? "");
    setAzureResource(
      resource
        ? { name: resource.name, project: resource.project ?? "" }
        : EMPTY_AZURE_RESOURCE,
    );
    setExtraHeaders(
      (selectedConnection?.extraHeaderKeys ?? []).map((key) => ({
        id: crypto.randomUUID(),
        key,
        value: "",
      })),
    );
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
    setVertexLocation(DEFAULT_VERTEX_LOCATION);
    loadEndpoint(null);
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
        id: selectedConnection?.id,
        provider: selectedConnection?.provider ?? provider,
        credential,
        config: getConfig(selectedConnection),
        ...getEndpoint(selectedConnection),
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-providers");
    }
  };

  const submit = async (
    selectedConnection: GatewayConnection | null,
    closeDialog: () => void,
  ) => {
    /** Saving re-validates on the server, so an earlier test result no longer applies. */
    test.reset();
    try {
      let saved;
      if (selectedConnection) {
        saved = await update.mutateAsync({
          orgId: organizationId,
          id: selectedConnection.id,
          name,
          ...(credential ? { credential } : {}),
          ...getEndpoint(selectedConnection),
        });
        capture("ai_gateway:provider_credential_updated", {
          orgId: organizationId,
          provider: selectedConnection.provider,
          isRenamed: name.trim() !== selectedConnection.name,
          isCredentialReplaced: Boolean(credential),
        });
      } else {
        saved = await create.mutateAsync({
          orgId: organizationId,
          provider,
          name,
          credential,
          config: getConfig(null),
          ...getEndpoint(null),
        });
        capture("ai_gateway:provider_credential_added", {
          orgId: organizationId,
          surface,
          provider,
          isFirstCredential: existingNames.length === 0,
        });
        onAfterCreate?.({ provider });
      }
      if (saved.modelListingDenied) {
        showToast({
          type: "WARNING",
          analytics: {
            errorOrigin: "backend",
            errorCategory: "permission",
            operation: selectedConnection
              ? "aiGateway.updateConnection"
              : "aiGateway.createConnection",
          },
          title: "Connection saved, but its models can't be listed",
        });
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
      size="md"
      closeOnInteractionOutside={false}
      onDismiss={reset}
      onBeforeClose={() => !isPending}
      renderContent={({ state: selectedConnection, closeDialog }) => {
        const nameError = getNameError(selectedConnection);
        const config = getConfig(selectedConnection);
        const isMissingRegion =
          config !== undefined && "region" in config && config.region === "";
        const storedRegion = selectedConnection?.config
          ? getStoredRegionField(selectedConnection.config)
          : null;
        const dialogProvider = selectedConnection?.provider ?? provider;
        const isMissingEndpoint =
          dialogProvider === "AZURE" && !isValidAzureResource(azureResource);
        return (
          <>
            <DialogHeader>
              <DialogTitle>
                {selectedConnection ? "Edit connection" : "Add connection"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="gap-6">
              {isGatewayHipaaNoticeVisible(region) ? (
                <Alert variant="info" icon={Info}>
                  <Alert.Title>HIPAA region</Alert.Title>
                  <Alert.Description>
                    Requests are forwarded to the provider you configure, using
                    your provider connection and on your instruction. Make sure
                    you have a BAA with that provider before sending PHI.
                  </Alert.Description>
                </Alert>
              ) : null}
              {selectedConnection ? (
                <div>
                  <FieldHeader
                    htmlFor="gateway-provider"
                    label="Provider"
                    description="Fixed once the connection is saved."
                  />
                  <Input
                    id="gateway-provider"
                    value={providerLabels[selectedConnection.provider]}
                    disabled
                  />
                </div>
              ) : (
                <ProviderSelect
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
              {storedRegion ? (
                <div>
                  <FieldHeader
                    htmlFor={storedRegion.id}
                    label={storedRegion.label}
                    description="Fixed once the connection is saved."
                  />
                  <Input
                    id={storedRegion.id}
                    value={storedRegion.value}
                    disabled
                  />
                </div>
              ) : null}
              {!selectedConnection && provider === "BEDROCK" ? (
                <RegionField
                  id={BEDROCK_REGION_FIELD.id}
                  label={BEDROCK_REGION_FIELD.label}
                  description="Requests go to Bedrock in this region. It can't be changed after saving."
                  groups={bedrockRegionGroups}
                  value={awsRegion}
                  onChange={setAwsRegion}
                />
              ) : null}
              {!selectedConnection && provider === "VERTEX" ? (
                <RegionField
                  id={VERTEX_LOCATION_FIELD.id}
                  label={VERTEX_LOCATION_FIELD.label}
                  description="Requests go to Vertex AI in this location. It can't be changed after saving."
                  groups={vertexLocationGroups}
                  value={vertexLocation}
                  onChange={setVertexLocation}
                />
              ) : null}
              {dialogProvider === "AZURE" ? (
                <AzureResourceField
                  value={azureResource}
                  isEditing={Boolean(selectedConnection)}
                  onChange={setAzureResource}
                />
              ) : null}
              <SecretKeyField
                provider={selectedConnection?.provider ?? provider}
                credential={credential}
                hasSavedKey={Boolean(selectedConnection)}
                onCredentialChange={setCredential}
              />
              {supportsCustomEndpoint(dialogProvider) ? (
                <AdvancedSettings
                  provider={dialogProvider}
                  baseURL={baseURL}
                  headers={extraHeaders}
                  storedHeaderKeys={selectedConnection?.extraHeaderKeys ?? []}
                  isEditing={Boolean(selectedConnection)}
                  onBaseURLChange={setBaseURL}
                  onHeadersChange={setExtraHeaders}
                />
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
              {isSaveError ? (
                <Alert variant="destructive">
                  <Alert.Title>Connection could not be saved</Alert.Title>
                  <Alert.Description>
                    {/* Base URL validation and provider errors can echo the configured host. */}
                    <span className="ph-no-capture">{saveError?.message}</span>
                  </Alert.Description>
                </Alert>
              ) : null}
              {test.data?.success &&
              test.data.modelListingDenied &&
              !isSaveError ? (
                <ModelListingDeniedAlert provider={dialogProvider} />
              ) : null}
            </DialogBody>
            <DialogFooter>
              {testOutcome ? (
                <ConnectionTestStatus
                  status={testOutcome.status}
                  failure={testOutcome.failure}
                />
              ) : null}
              <Button
                variant="secondary"
                disabled={
                  !credential ||
                  isMissingRegion ||
                  isMissingEndpoint ||
                  isPending
                }
                loading={test.isPending}
                onClick={() => testCredential(selectedConnection)}
              >
                {test.isSuccess || test.isError ? "Test again" : "Test"}
              </Button>
              <Button
                disabled={
                  !name.trim() ||
                  Boolean(nameError) ||
                  (!selectedConnection && !credential) ||
                  isMissingRegion ||
                  isMissingEndpoint ||
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
      {({ openDialog }) => {
        const openAddDialogFor = (selectedProvider: GatewayProvider) => {
          setProvider(selectedProvider);
          setNameDraft(connection?.name ?? null);
          setCredential("");
          setAwsRegion("");
          setVertexLocation(DEFAULT_VERTEX_LOCATION);
          loadEndpoint(connection ?? null);
          resetMutations();
          openDialog(connection ?? null);
        };
        return children({
          openAddDialog: () =>
            openAddDialogFor(connection?.provider ?? "OPENAI"),
          openAddDialogFor,
          openEditDialog: (selectedConnection) => {
            setProvider(selectedConnection.provider);
            setNameDraft(selectedConnection.name);
            setCredential("");
            setAwsRegion("");
            setVertexLocation(DEFAULT_VERTEX_LOCATION);
            loadEndpoint(selectedConnection);
            resetMutations();
            openDialog(selectedConnection);
          },
        });
      }}
    </DialogController>
  );
}

function isValidAzureResource({ name, project }: AzureResourceFieldValue) {
  return (
    isAzureResourceName(name) &&
    (project.trim() === "" || isAzureProjectName(project))
  );
}

/** A provider refusing the credential resolves the test; other failures reject it. */
function getTestOutcome({
  status,
  data,
  error,
}: {
  status: MutationStatus;
  data?: TestConnectionResult;
  error: { message: string } | null;
}): TestOutcome | null {
  if (status === "idle") return null;
  if (status === "pending") return { status };
  if (error) {
    return {
      status: "error",
      failure: {
        title: "Error",
        status: null,
        statusText: null,
        body: error.message,
      },
    };
  }
  if (data && !data.success) {
    return {
      status: "error",
      failure: { title: "Provider response", ...data.providerResponse },
    };
  }
  return { status: "success" };
}

type TestConnectionResult = RouterOutputs["aiGateway"]["testConnection"];

type TestOutcome = {
  status: Exclude<MutationStatus, "idle">;
  failure?: ConnectionTestFailure;
};
