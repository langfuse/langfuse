import { useState, type ReactNode } from "react";
import { type MutationStatus } from "@tanstack/react-query";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { GatewayBulkGuardrailTargetsDialog } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayBulkGuardrailTargetsDialog/GatewayBulkGuardrailTargetsDialog";
import {
  GatewayGuardrailFormDialog,
  type ExternalGuardrailTestControl,
  type ExternalGuardrailTestOutcome,
  type GatewayGuardrailFormValues,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/GatewayGuardrailFormDialog";
import { GatewayGuardrailTemplateGallery } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTemplateGallery/GatewayGuardrailTemplateGallery";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { assignmentsToTargetOptions } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/assignmentsToTargetOptions";
import { targetOptionsToAssignments } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/targetOptionsToAssignments";
import { useGatewayGuardrailTargetPicker } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/hooks/useGatewayGuardrailTargetPicker";
import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import { useOpenGuardrailsLimitFeedback } from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
import { GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  type GatewayGuardrailPreset,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  type RouterInputs,
  type RouterOutputs,
} from "@/src/utils/api";

type TestGuardrailResult = RouterOutputs["aiGateway"]["guardrails"]["test"];

type BulkTargetsInput =
  RouterInputs["aiGateway"]["guardrails"]["setAssignments"]["target"];

export type GuardrailDialogState =
  | { mode: "create" }
  | { mode: "edit"; guardrail: GatewayGuardrailRow }
  | {
      mode: "bulkTargets";
      target: BulkTargetsInput;
      selectedCount: number;
      initialAssignments?: GatewayGuardrailRow["assignments"];
      onAfterSave: () => void;
    };

export type GatewayGuardrailDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (state: GuardrailDialogState) => void;
  }) => ReactNode;
};

/** Manages create, edit, and bulk "Set applies to" guardrail dialogs. */
export function GatewayGuardrailDialogController({
  organizationId,
  children,
}: GatewayGuardrailDialogControllerProps) {
  const invalidateGuardrails = useInvalidateGatewayGuardrails(organizationId);
  const openLimitFeedback = useOpenGuardrailsLimitFeedback();
  const testMutation = api.aiGateway.guardrails.test.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });
  const createMutation = api.aiGateway.guardrails.create.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });
  const updateMutation = api.aiGateway.guardrails.update.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });
  const bulkTargetsMutation =
    api.aiGateway.guardrails.setAssignments.useMutation({
      onError: (error) =>
        reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
    });

  const isPending =
    testMutation.isPending ||
    createMutation.isPending ||
    updateMutation.isPending ||
    bulkTargetsMutation.isPending;

  const resetMutations = () => {
    testMutation.reset();
    createMutation.reset();
    updateMutation.reset();
    bulkTargetsMutation.reset();
  };

  const testOutcome = getTestOutcome(testMutation);

  return (
    <DialogController<GuardrailDialogState>
      onBeforeClose={() => !isPending}
      onDismiss={resetMutations}
      renderDialog={({ state, closeDialog }) => {
        const errorMessage = getMutationErrorMessage(state.mode, {
          create: createMutation,
          edit: updateMutation,
          bulkTargets: bulkTargetsMutation,
        });

        const handleContactSupport = () => {
          closeDialog();
          resetMutations();
          openLimitFeedback();
        };

        const handleTestForm = async (values: GatewayGuardrailFormValues) => {
          if (!values.bedrock) return;
          try {
            await testMutation.mutateAsync({
              orgId: organizationId,
              id: state.mode === "edit" ? state.guardrail.id : undefined,
              type: "BEDROCK",
              bedrock: values.bedrock,
            });
          } catch (error) {
            reportNonTrpcError(error, "ai-gateway-guardrails");
          }
        };

        const handleSubmitForm = async (values: GatewayGuardrailFormValues) => {
          testMutation.reset();
          const assignments = targetOptionsToAssignments(values.targets);
          try {
            if (state.mode === "create") {
              if (values.bedrock) {
                await createMutation.mutateAsync({
                  orgId: organizationId,
                  type: "BEDROCK",
                  name: values.name,
                  action: values.action,
                  redactionLabel: values.redactionLabel,
                  bedrock: {
                    guardrailId: values.bedrock.guardrailId,
                    guardrailVersion: values.bedrock.guardrailVersion,
                    region: values.bedrock.region,
                    apiKey: values.bedrock.apiKey ?? "",
                  },
                  assignments,
                });
              } else {
                await createMutation.mutateAsync({
                  orgId: organizationId,
                  type: "REGEX",
                  name: values.name,
                  action: values.action,
                  redactionLabel: values.redactionLabel,
                  presets: values.presets,
                  secretPrefixes: values.secretPrefixes,
                  containsWords: values.containsWords,
                  assignments,
                });
              }
            } else if (state.mode === "edit") {
              if (values.bedrock) {
                await updateMutation.mutateAsync({
                  orgId: organizationId,
                  id: state.guardrail.id,
                  type: "BEDROCK",
                  name: values.name,
                  action: values.action,
                  redactionLabel: values.redactionLabel,
                  bedrock: values.bedrock,
                  assignments,
                });
              } else {
                await updateMutation.mutateAsync({
                  orgId: organizationId,
                  id: state.guardrail.id,
                  type: "REGEX",
                  name: values.name,
                  action: values.action,
                  redactionLabel: values.redactionLabel,
                  presets: values.presets,
                  secretPrefixes: values.secretPrefixes,
                  containsWords: values.containsWords,
                  assignments,
                });
              }
            }
            closeDialog();
            resetMutations();
          } catch (error) {
            reportNonTrpcError(error, "ai-gateway-guardrails");
          } finally {
            await invalidateGuardrails();
          }
        };

        const handleSubmitBulkTargets = async (
          targets: AsyncAutocompleteOption[],
        ) => {
          if (state.mode !== "bulkTargets") return;
          try {
            await bulkTargetsMutation.mutateAsync({
              orgId: organizationId,
              target: state.target,
              assignments: targetOptionsToAssignments(targets),
            });
            state.onAfterSave();
            closeDialog();
            resetMutations();
          } catch (error) {
            reportNonTrpcError(error, "ai-gateway-guardrails");
          } finally {
            await invalidateGuardrails();
          }
        };

        const externalTest: ExternalGuardrailTestControl = {
          isPending: testMutation.isPending,
          outcome: testOutcome,
          onTest: handleTestForm,
        };

        return (
          <GuardrailDialogContent
            organizationId={organizationId}
            state={state}
            isSubmitting={
              createMutation.isPending ||
              updateMutation.isPending ||
              bulkTargetsMutation.isPending
            }
            errorMessage={errorMessage}
            externalTest={externalTest}
            onClearError={resetMutations}
            onContactSupport={handleContactSupport}
            onSubmitForm={handleSubmitForm}
            onSubmitBulkTargets={handleSubmitBulkTargets}
          />
        );
      }}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

type GuardrailDialogContentProps = {
  organizationId: string;
  state: GuardrailDialogState;
  isSubmitting: boolean;
  errorMessage: string | null;
  externalTest: ExternalGuardrailTestControl;
  onClearError: () => void;
  onContactSupport: () => void;
  onSubmitForm: (values: GatewayGuardrailFormValues) => void;
  onSubmitBulkTargets: (targets: AsyncAutocompleteOption[]) => void;
};

function GuardrailDialogContent({
  organizationId,
  state,
  isSubmitting,
  errorMessage,
  externalTest,
  onClearError,
  onContactSupport,
  onSubmitForm,
  onSubmitBulkTargets,
}: GuardrailDialogContentProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<GatewayGuardrailTemplate | null>(null);

  const needsTargets = state.mode !== "create" || selectedTemplate !== null;
  const targetPicker = useGatewayGuardrailTargetPicker(
    organizationId,
    needsTargets,
  );

  if (state.mode === "bulkTargets") {
    const initialTargets = state.initialAssignments
      ? assignmentsToTargetOptions(state.initialAssignments)
      : [EVERYONE_TARGET_OPTION];
    return (
      <GatewayBulkGuardrailTargetsDialog
        selectedCount={state.selectedCount}
        initialTargets={initialTargets}
        targetPicker={targetPicker}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onSubmit={onSubmitBulkTargets}
      />
    );
  }

  if (state.mode === "create" && selectedTemplate === null) {
    return (
      <GatewayGuardrailTemplateGallery onSelectTemplate={setSelectedTemplate} />
    );
  }

  if (state.mode === "create" && selectedTemplate !== null) {
    const handleBack = () => {
      onClearError();
      setSelectedTemplate(null);
    };
    const isExternal = Boolean(selectedTemplate.external);
    return (
      <GatewayGuardrailFormDialog
        key={selectedTemplate.id}
        title={selectedTemplate.name}
        submitLabel={isExternal ? "Test and save" : "Add guardrail"}
        templateKind={selectedTemplate.id}
        availablePresets={selectedTemplate.presets}
        externalTest={isExternal ? externalTest : undefined}
        initialValues={{
          name: selectedTemplate.name,
          presets: [...selectedTemplate.defaultPresets],
          secretPrefixes: [],
          containsWords: [],
          action: "BLOCK",
          redactionLabel: GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
          targets: [EVERYONE_TARGET_OPTION],
        }}
        initialTestText={selectedTemplate.sampleTestText}
        targetPicker={targetPicker}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onBack={handleBack}
        onContactSupport={onContactSupport}
        onSubmit={onSubmitForm}
      />
    );
  }

  const { guardrail } = state as Extract<
    GuardrailDialogState,
    { mode: "edit" }
  >;
  const { templateKind, availablePresets } = resolveEditableTemplate(guardrail);
  const isExternal = guardrail.type === "BEDROCK";

  return (
    <GatewayGuardrailFormDialog
      key={guardrail.id}
      title="Edit guardrail"
      submitLabel={isExternal ? "Test and save" : "Save changes"}
      templateKind={templateKind}
      availablePresets={availablePresets}
      hasSavedApiKey={isExternal}
      externalTest={isExternal ? externalTest : undefined}
      initialValues={{
        name: guardrail.name,
        presets: guardrail.presets,
        secretPrefixes: guardrail.secretPrefixes,
        containsWords: guardrail.containsWords,
        bedrock: guardrail.bedrock ?? undefined,
        action: guardrail.action,
        redactionLabel:
          guardrail.redactionLabel ?? GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
        targets: assignmentsToTargetOptions(guardrail.assignments),
      }}
      targetPicker={targetPicker}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onSubmit={onSubmitForm}
    />
  );
}

function getTestOutcome({
  status,
  data,
  error,
}: {
  status: MutationStatus;
  data?: TestGuardrailResult;
  error: { message: string } | null;
}): ExternalGuardrailTestOutcome | null {
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

function getMutationErrorMessage(
  mode: GuardrailDialogState["mode"],
  mutations: Record<
    GuardrailDialogState["mode"],
    { isError: boolean; error: { message?: string } | null }
  >,
) {
  const active = mutations[mode];
  return active.isError ? (active.error?.message ?? "Try again.") : null;
}

function resolveEditableTemplate(guardrail: GatewayGuardrailRow): {
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
} {
  if (guardrail.type === "BEDROCK") {
    return { templateKind: "bedrock", availablePresets: [] };
  }
  if (
    guardrail.presets.length === 0 &&
    guardrail.secretPrefixes.length === 0 &&
    guardrail.containsWords.length > 0
  ) {
    return { templateKind: "contains", availablePresets: [] };
  }
  const hasSecrets =
    guardrail.secretPrefixes.length > 0 ||
    (guardrail.presets.length > 0 &&
      guardrail.presets.every(
        (preset) => GATEWAY_GUARDRAIL_PRESETS[preset].group === "secrets",
      ));
  if (hasSecrets) {
    const secretsTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
      (template) => template.id === "secrets",
    );
    return {
      templateKind: "secrets",
      availablePresets:
        secretsTemplate?.presets ?? GATEWAY_GUARDRAIL_PRESET_KEYS,
    };
  }
  const piiTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
    (template) => template.id === "pii",
  );
  const allPii =
    guardrail.presets.length > 0 &&
    guardrail.presets.every(
      (preset) => GATEWAY_GUARDRAIL_PRESETS[preset].group === "pii",
    );
  return {
    templateKind: "pii",
    availablePresets: allPii
      ? (piiTemplate?.presets ?? GATEWAY_GUARDRAIL_PRESET_KEYS)
      : GATEWAY_GUARDRAIL_PRESET_KEYS,
  };
}
