import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { KeyRound, User } from "@langfuse/icons";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
import {
  GatewayGuardrailFormDialog,
  type GatewayGuardrailFormValues,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/GatewayGuardrailFormDialog";
import { GatewayGuardrailTemplateGallery } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTemplateGallery/GatewayGuardrailTemplateGallery";
import {
  API_KEY_TARGET_PREFIX,
  EVERYONE_TARGET_OPTION,
  USER_TARGET_PREFIX,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { assignmentsToTargetOptions } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/assignmentsToTargetOptions";
import { targetOptionsToAssignments } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/targetOptionsToAssignments";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
} from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import { useOpenGuardrailsLimitFeedback } from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
import {
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
                    assignments,
                  });
                } else {
                  await updateMutation.mutateAsync({
                    orgId: organizationId,
                    id: state.guardrail.id,
                    name: values.name,
                    action: values.action,
                    presets: values.presets,
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
  const [search, setSearch] = useState("");

  const isFormOpen = state.mode === "edit" || selectedTemplate !== null;
  const targetsQuery = api.aiGateway.searchGuardrailTargets.useQuery(
    {
      orgId: organizationId,
      searchQuery: search || undefined,
    },
    {
      enabled: isFormOpen,
      placeholderData: keepPreviousData,
    },
  );

  const targetOptions = useMemo<TagAutocompleteOption[]>(() => {
    if (!targetsQuery.data) return [];
    const users: TagAutocompleteOption[] = targetsQuery.data.users.map(
      (user) => ({
        value: `${USER_TARGET_PREFIX}${user.id}`,
        label: user.name || user.email || user.id,
        secondaryLabel: user.name && user.email ? user.email : undefined,
        icon: User,
      }),
    );
    const apiKeys: TagAutocompleteOption[] = targetsQuery.data.apiKeys.map(
      (apiKey) => ({
        value: `${API_KEY_TARGET_PREFIX}${apiKey.id}`,
        label: apiKey.name,
        secondaryLabel: apiKey.ownerLabel ?? "API key",
        icon: KeyRound,
      }),
    );
    return [...users, ...apiKeys];
  }, [targetsQuery.data]);

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
        availablePresets={selectedTemplate.presets}
        initialValues={{
          name: selectedTemplate.name,
          presets: [...selectedTemplate.defaultPresets],
          action: "BLOCK",
          targets: [EVERYONE_TARGET_OPTION],
        }}
        initialTestText={selectedTemplate.sampleTestText}
        targetPicker={{
          options: targetOptions,
          search,
          onSearchChange: setSearch,
          isLoading: targetsQuery.isLoading,
        }}
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
  const availablePresets = resolveEditablePresets(guardrail.presets);
  const initialAction: GatewayGuardrailUiAction =
    guardrail.action === "LOG" ? "LOG" : "BLOCK";

  return (
    <GatewayGuardrailFormDialog
      key={guardrail.id}
      title="Edit guardrail"
      submitLabel="Save changes"
      availablePresets={availablePresets}
      initialValues={{
        name: guardrail.name,
        presets: guardrail.presets,
        action: initialAction,
        targets: assignmentsToTargetOptions(guardrail.assignments),
      }}
      targetPicker={{
        options: targetOptions,
        search,
        onSearchChange: setSearch,
        isLoading: targetsQuery.isLoading,
      }}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onSubmit={onSubmit}
    />
  );
}

/**
 * Shows the owning template's presets when a guardrail belongs cleanly to one
 * template, or every built-in preset if it combines presets across templates.
 */
function resolveEditablePresets(
  presets: readonly GatewayGuardrailPreset[],
): readonly GatewayGuardrailPreset[] {
  const matchingTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
    (template) =>
      presets.length > 0 &&
      presets.every((preset) => template.presets.includes(preset)),
  );
  return matchingTemplate
    ? matchingTemplate.presets
    : GATEWAY_GUARDRAIL_PRESET_KEYS;
}
