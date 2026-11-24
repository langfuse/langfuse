import { useState, type ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  GatewayGuardrailFormDialog,
  type GatewayGuardrailFormValues,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/GatewayGuardrailFormDialog";
import { GatewayGuardrailTemplateGallery } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTemplateGallery/GatewayGuardrailTemplateGallery";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/constants/guardrailTargetConstants";
import { assignmentsToTargetOptions } from "@/src/features/ai-gateway/fns/assignmentsToTargetOptions";
import { targetOptionsToAssignments } from "@/src/features/ai-gateway/fns/targetOptionsToAssignments";
import { useGatewayGuardrailTargetPicker } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailTargetPicker";
import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import { useOpenGuardrailsLimitFeedback } from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  type GatewayGuardrailPreset,
  type GatewayGuardrailUiAction,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

export type GuardrailDialogState =
  | { mode: "create" }
  | { mode: "edit"; guardrail: GatewayGuardrailRow };

export type GatewayGuardrailDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (state: GuardrailDialogState) => void;
  }) => ReactNode;
};

export function GatewayGuardrailDialogController({
  organizationId,
  children,
}: GatewayGuardrailDialogControllerProps) {
  const invalidateGuardrails = useInvalidateGatewayGuardrails(organizationId);
  const openLimitFeedback = useOpenGuardrailsLimitFeedback();
  const createMutation = api.aiGateway.createGuardrail.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });
  const updateMutation = api.aiGateway.updateGuardrail.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-guardrails"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const resetMutations = () => {
    createMutation.reset();
    updateMutation.reset();
  };

  return (
    <DialogController<GuardrailDialogState>
      onBeforeClose={() => !isPending}
      onDismiss={resetMutations}
      renderDialog={({ state, closeDialog }) => {
        const activeMutation =
          state.mode === "create" ? createMutation : updateMutation;
        const errorMessage = activeMutation.isError
          ? (activeMutation.error?.message ?? "Try again.")
          : null;

        const handleContactSupport = () => {
          closeDialog();
          resetMutations();
          openLimitFeedback();
        };

        return (
          <ConnectedGuardrailDialog
            organizationId={organizationId}
            state={state}
            isSubmitting={isPending}
            errorMessage={errorMessage}
            onClearError={resetMutations}
            onContactSupport={handleContactSupport}
            onSubmit={async (values) => {
              const assignments = targetOptionsToAssignments(values.targets);
              try {
                if (state.mode === "create") {
                  await createMutation.mutateAsync({
                    orgId: organizationId,
                    name: values.name,
                    action: values.action,
                    presets: values.presets,
                    secretPrefixes: values.secretPrefixes,
                    containsWords: values.containsWords,
                    assignments,
                  });
                } else {
                  await updateMutation.mutateAsync({
                    orgId: organizationId,
                    id: state.guardrail.id,
                    name: values.name,
                    action: values.action,
                    presets: values.presets,
                    secretPrefixes: values.secretPrefixes,
                    containsWords: values.containsWords,
                    assignments,
                  });
                }
                closeDialog();
                resetMutations();
              } catch (error) {
                reportNonTrpcError(error, "ai-gateway-guardrails");
              } finally {
                await invalidateGuardrails();
              }
            }}
          />
        );
      }}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

type ConnectedGuardrailDialogProps = {
  organizationId: string;
  state: GuardrailDialogState;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  onContactSupport: () => void;
  onSubmit: (values: GatewayGuardrailFormValues) => void;
};

function ConnectedGuardrailDialog({
  organizationId,
  state,
  isSubmitting,
  errorMessage,
  onClearError,
  onContactSupport,
  onSubmit,
}: ConnectedGuardrailDialogProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<GatewayGuardrailTemplate | null>(null);

  const isFormOpen = state.mode === "edit" || selectedTemplate !== null;
  const targetPicker = useGatewayGuardrailTargetPicker(
    organizationId,
    isFormOpen,
  );

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
    return (
      <GatewayGuardrailFormDialog
        key={selectedTemplate.id}
        title={selectedTemplate.name}
        submitLabel="Add guardrail"
        templateKind={selectedTemplate.id}
        availablePresets={selectedTemplate.presets}
        initialValues={{
          name: selectedTemplate.name,
          presets: [...selectedTemplate.defaultPresets],
          secretPrefixes: [],
          containsWords: [],
          action: "BLOCK",
          targets: [EVERYONE_TARGET_OPTION],
        }}
        initialTestText={selectedTemplate.sampleTestText}
        targetPicker={targetPicker}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onBack={handleBack}
        onContactSupport={onContactSupport}
        onSubmit={onSubmit}
      />
    );
  }

  const { guardrail } = state as Extract<
    GuardrailDialogState,
    { mode: "edit" }
  >;
  const { templateKind, availablePresets } = resolveEditableTemplate(guardrail);
  const initialAction: GatewayGuardrailUiAction =
    guardrail.action === "LOG" ? "LOG" : "BLOCK";

  return (
    <GatewayGuardrailFormDialog
      key={guardrail.id}
      title="Edit guardrail"
      submitLabel="Save changes"
      templateKind={templateKind}
      availablePresets={availablePresets}
      initialValues={{
        name: guardrail.name,
        presets: guardrail.presets,
        secretPrefixes: guardrail.secretPrefixes,
        containsWords: guardrail.containsWords,
        action: initialAction,
        targets: assignmentsToTargetOptions(guardrail.assignments),
      }}
      targetPicker={targetPicker}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onSubmit={onSubmit}
    />
  );
}

function resolveEditableTemplate(guardrail: GatewayGuardrailRow): {
  templateKind: GatewayGuardrailTemplateKind;
  availablePresets: readonly GatewayGuardrailPreset[];
} {
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
