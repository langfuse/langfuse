import { useState, type ReactNode } from "react";
import { type MutationStatus } from "@tanstack/react-query";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { GatewayBulkGuardrailTargetsDialog } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayBulkGuardrailTargetsDialog/GatewayBulkGuardrailTargetsDialog";
import {
  GatewayGuardrailFormDialog,
  type ExternalGuardrailTestControl,
  type ExternalGuardrailTestOutcome,
  type GatewayGuardrailFormDialogProps,
  type GatewayGuardrailFormValues,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailFormDialog/GatewayGuardrailFormDialog";
import {
  GatewayGuardrailTemplateGallery,
  type GatewayGuardrailTemplateGalleryTab,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTemplateGallery/GatewayGuardrailTemplateGallery";
import {
  GATEWAY_GUARDRAIL_TEMPLATES,
  type GatewayGuardrailTemplate,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { assignmentsToTargetOptions } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/assignmentsToTargetOptions";
import { targetOptionsToAssignments } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/fns/targetOptionsToAssignments";
import { summarizeGuardrailAssignments } from "@/src/features/ai-gateway/fns/summarizeGuardrailAssignments";
import { toGuardrailConfigAnalytics } from "@/src/features/ai-gateway/fns/toGuardrailConfigAnalytics";
import { useGatewayGuardrailRegexPreview } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/hooks/useGatewayGuardrailRegexPreview";
import { useGatewayGuardrailTargetPicker } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/hooks/useGatewayGuardrailTargetPicker";
import { GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { useInvalidateGatewayGuardrails } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails";
import {
  useOpenGuardrailsLimitFeedback,
  type GatewayGuardrailsLimitFeedbackReason,
} from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
import {
  GATEWAY_GUARDRAIL_PRESETS,
  GATEWAY_GUARDRAIL_PRESET_KEYS,
  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES,
  resolveSupportedGuardrailAction,
  resolveSupportedGuardrailScope,
  type GatewayGuardrailPreset,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/types/gatewayGuardrail";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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

export type { GatewayGuardrailTemplateKind };

export type GuardrailDialogState =
  | { mode: "create"; templateKind?: GatewayGuardrailTemplateKind }
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
  const capture = usePostHogClientCapture();
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
    if (testMutation.status !== "idle") testMutation.reset();
    if (createMutation.status !== "idle") createMutation.reset();
    if (updateMutation.status !== "idle") updateMutation.reset();
    if (bulkTargetsMutation.status !== "idle") bulkTargetsMutation.reset();
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

        const handleContactSupport = (
          reason: GatewayGuardrailsLimitFeedbackReason = "count",
        ) => {
          closeDialog();
          resetMutations();
          openLimitFeedback(reason);
        };

        const handleTestForm = async (values: GatewayGuardrailFormValues) => {
          const external = toExternalTestInput(values);
          if (!external) return;
          try {
            await testMutation.mutateAsync({
              orgId: organizationId,
              id: state.mode === "edit" ? state.guardrail.id : undefined,
              ...external,
            });
          } catch (error) {
            reportNonTrpcError(error, "ai-gateway-guardrails");
          }
        };

        const handleSubmitForm = async (
          values: GatewayGuardrailFormValues,
          template: GatewayGuardrailTemplateKind,
        ) => {
          testMutation.reset();
          const assignments = targetOptionsToAssignments(values.targets);
          const createGuardrail = () => {
            if (values.openAiModeration) {
              return createMutation.mutateAsync({
                orgId: organizationId,
                type: "OPENAI_MODERATION",
                name: values.name,
                action: resolveSupportedGuardrailAction(
                  "OPENAI_MODERATION",
                  values.action,
                ),
                scope: values.scope,
                openAiModeration: {
                  region: values.openAiModeration.region,
                  apiKey: values.openAiModeration.apiKey ?? "",
                },
                assignments,
              });
            }
            if (values.bedrock) {
              return createMutation.mutateAsync({
                orgId: organizationId,
                type: "BEDROCK",
                name: values.name,
                action: resolveSupportedGuardrailAction(
                  "BEDROCK",
                  values.action,
                ),
                scope: values.scope,
                bedrock: {
                  guardrailId: values.bedrock.guardrailId,
                  guardrailVersion: values.bedrock.guardrailVersion,
                  region: values.bedrock.region,
                  apiKey: values.bedrock.apiKey ?? "",
                },
                assignments,
              });
            }
            return createMutation.mutateAsync({
              orgId: organizationId,
              type: "REGEX",
              name: values.name,
              ...toRegexActionInput(values),
              presets: values.presets,
              secretPrefixes: values.secretPrefixes,
              containsWords: values.containsWords,
              customRegex: values.customRegex || undefined,
              assignments,
            });
          };
          const updateGuardrail = (id: string) => {
            if (values.openAiModeration) {
              return updateMutation.mutateAsync({
                orgId: organizationId,
                id,
                type: "OPENAI_MODERATION",
                name: values.name,
                action: resolveSupportedGuardrailAction(
                  "OPENAI_MODERATION",
                  values.action,
                ),
                scope: values.scope,
                openAiModeration: values.openAiModeration,
                assignments,
              });
            }
            if (values.bedrock) {
              return updateMutation.mutateAsync({
                orgId: organizationId,
                id,
                type: "BEDROCK",
                name: values.name,
                action: resolveSupportedGuardrailAction(
                  "BEDROCK",
                  values.action,
                ),
                scope: values.scope,
                bedrock: values.bedrock,
                assignments,
              });
            }
            return updateMutation.mutateAsync({
              orgId: organizationId,
              id,
              type: "REGEX",
              name: values.name,
              ...toRegexActionInput(values),
              presets: values.presets,
              secretPrefixes: values.secretPrefixes,
              containsWords: values.containsWords,
              customRegex: values.customRegex || undefined,
              assignments,
            });
          };
          try {
            if (state.mode === "create") {
              const created = await createGuardrail();
              capture("ai_gateway:guardrail_created", {
                orgId: organizationId,
                ...toGuardrailConfigAnalytics({ template, guardrail: created }),
              });
            } else if (state.mode === "edit") {
              const updated = await updateGuardrail(state.guardrail.id);
              capture("ai_gateway:guardrail_updated", {
                orgId: organizationId,
                ...toGuardrailConfigAnalytics({ template, guardrail: updated }),
              });
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
          const assignments = targetOptionsToAssignments(targets);
          try {
            const result = await bulkTargetsMutation.mutateAsync({
              orgId: organizationId,
              target: state.target,
              assignments,
            });
            if (result.updatedCount > 0) {
              capture("ai_gateway:guardrail_targets_updated", {
                orgId: organizationId,
                guardrailCount: result.updatedCount,
                isSelectAll: state.target.type === "matching",
                ...summarizeGuardrailAssignments(assignments),
              });
            }
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
  onContactSupport: (reason?: GatewayGuardrailsLimitFeedbackReason) => void;
  onSubmitForm: (
    values: GatewayGuardrailFormValues,
    template: GatewayGuardrailTemplateKind,
  ) => void;
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
  const initialTemplate =
    state.mode === "create" && state.templateKind
      ? (GATEWAY_GUARDRAIL_TEMPLATES.find(
          (template) => template.id === state.templateKind,
        ) ?? null)
      : null;
  const [selectedTemplate, setSelectedTemplate] =
    useState<GatewayGuardrailTemplate | null>(initialTemplate);
  const [galleryTab, setGalleryTab] =
    useState<GatewayGuardrailTemplateGalleryTab>(
      initialTemplate?.external ? "integrations" : "built-in",
    );

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

  if (state.mode === "create") {
    const handleBack = () => {
      onClearError();
      setSelectedTemplate(null);
    };
    const handleSubmitCreate = (values: GatewayGuardrailFormValues) => {
      if (!selectedTemplate) return;
      onSubmitForm(values, selectedTemplate.id);
    };
    const isExternal = Boolean(selectedTemplate?.external);
    return (
      <Dialog
        title={selectedTemplate ? selectedTemplate.name : "Add a guardrail"}
        size={selectedTemplate && isExternal ? "md" : "lg"}
        closeOnInteractionOutside={selectedTemplate === null}
        noCapture={selectedTemplate !== null}
        back={
          selectedTemplate
            ? { onClick: handleBack, label: "Back to guardrail types" }
            : undefined
        }
      >
        {selectedTemplate === null ? (
          <GatewayGuardrailTemplateGallery
            activeTab={galleryTab}
            onActiveTabChange={setGalleryTab}
            onSelectTemplate={setSelectedTemplate}
          />
        ) : (
          <ConnectedGuardrailFormContent
            key={selectedTemplate.id}
            organizationId={organizationId}
            submitLabel={isExternal ? "Test and save" : "Add guardrail"}
            templateKind={selectedTemplate.id}
            availablePresets={selectedTemplate.presets}
            externalTest={isExternal ? externalTest : undefined}
            initialValues={{
              name: selectedTemplate.name,
              presets: [...selectedTemplate.defaultPresets],
              secretPrefixes: [],
              containsWords: [],
              customRegex: null,
              action: resolveSupportedGuardrailAction(
                selectedTemplate.guardrailType,
                selectedTemplate.defaultAction ??
                  GATEWAY_GUARDRAIL_TYPE_CAPABILITIES[
                    selectedTemplate.guardrailType
                  ].defaultAction,
              ),
              scope: "LAST_TURN",
              redactionLabel: GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
              targets: [EVERYONE_TARGET_OPTION],
            }}
            initialTestText={selectedTemplate.sampleTestText}
            targetPicker={targetPicker}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
            onContactSupport={onContactSupport}
            onSubmit={handleSubmitCreate}
          />
        )}
      </Dialog>
    );
  }

  const { guardrail } = state as Extract<
    GuardrailDialogState,
    { mode: "edit" }
  >;
  const { templateKind, availablePresets } = resolveEditableTemplate(guardrail);
  const isExternal = guardrail.type !== "REGEX";
  const initialAction = resolveSupportedGuardrailAction(
    guardrail.type,
    guardrail.action,
  );
  const handleSubmitEdit = (values: GatewayGuardrailFormValues) => {
    onSubmitForm(values, templateKind);
  };

  return (
    <Dialog title="Edit guardrail" size={isExternal ? "md" : "lg"} noCapture>
      <ConnectedGuardrailFormContent
        key={guardrail.id}
        organizationId={organizationId}
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
          customRegex: guardrail.customRegex,
          bedrock: guardrail.bedrock ?? undefined,
          openAiModeration: guardrail.openAiModeration ?? undefined,
          action: initialAction,
          scope: guardrail.scope,
          redactionLabel:
            guardrail.redactionLabel ??
            GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
          targets: assignmentsToTargetOptions(guardrail.assignments),
        }}
        targetPicker={targetPicker}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onContactSupport={onContactSupport}
        onSubmit={handleSubmitEdit}
      />
    </Dialog>
  );
}

function toRegexActionInput(
  values: Pick<
    GatewayGuardrailFormValues,
    "action" | "scope" | "redactionLabel"
  >,
) {
  const action = resolveSupportedGuardrailAction("REGEX", values.action);
  if (action === "REDACT") {
    return {
      action,
      scope: values.scope,
      redactionLabel: values.redactionLabel,
    };
  }
  if (action === "BLOCK") {
    const scope = resolveSupportedGuardrailScope(
      "BLOCK",
      values.scope ?? "LAST_TURN",
    );
    return {
      action,
      scope: scope as "LAST_TURN" | "OUTPUT" | "LAST_TURN_AND_OUTPUT",
    };
  }
  return {
    action,
    scope: values.scope,
  };
}

function toExternalTestInput(values: GatewayGuardrailFormValues) {
  if (values.openAiModeration) {
    return {
      type: "OPENAI_MODERATION" as const,
      openAiModeration: values.openAiModeration,
    };
  }
  if (values.bedrock) {
    return { type: "BEDROCK" as const, bedrock: values.bedrock };
  }
  return null;
}

function ConnectedGuardrailFormContent({
  organizationId,
  ...props
}: Omit<GatewayGuardrailFormDialogProps, "customRegexPreview"> & {
  organizationId: string;
}) {
  const isCustomRegex = props.templateKind === "custom_regex";
  const customRegexPreview = useGatewayGuardrailRegexPreview({
    organizationId,
    enabled: isCustomRegex,
    initialPattern: props.initialValues.customRegex ?? "",
    initialText: props.initialTestText ?? "",
  });

  return (
    <GatewayGuardrailFormDialog
      {...props}
      customRegexPreview={isCustomRegex ? customRegexPreview : undefined}
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
  if (guardrail.type === "OPENAI_MODERATION") {
    return { templateKind: "openai_moderation", availablePresets: [] };
  }
  if (
    guardrail.presets.length === 0 &&
    guardrail.secretPrefixes.length === 0 &&
    guardrail.containsWords.length === 0 &&
    guardrail.customRegex
  ) {
    return { templateKind: "custom_regex", availablePresets: [] };
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
  const allPromptInjection =
    guardrail.presets.length > 0 &&
    guardrail.presets.every(
      (preset) =>
        GATEWAY_GUARDRAIL_PRESETS[preset].group === "prompt_injection",
    );
  if (allPromptInjection) {
    const promptInjectionTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
      (template) => template.id === "prompt_injection",
    );
    return {
      templateKind: "prompt_injection",
      availablePresets:
        promptInjectionTemplate?.presets ?? GATEWAY_GUARDRAIL_PRESET_KEYS,
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
