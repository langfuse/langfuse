import { useEffect, useRef, useState } from "react";
import type { GatewaySpendLimitScope } from "@langfuse/shared";

import { Skeleton } from "@/src/components/ui/skeleton";
import { toGatewaySpendLimitUpdate } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewaySpendLimitUpdate";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { GatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/GatewaySetupGuide";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupProgress";
import { useGatewaySetupBudgets } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupBudgets";
import { useGatewayTeamInvite } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayTeamInvite";
import { useSaveGatewayIngestion } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useSaveGatewayIngestion";
import type {
  GatewayConfig,
  GatewayProject,
  GatewaySetupBudgets,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useCaptureGatewayBudgetChange } from "@/src/features/ai-gateway/hooks/useCaptureGatewayBudgetChange";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const SETUP_BUDGET_SCOPES = {
  organization: "ORGANIZATION",
  user: "USER_DEFAULT",
} as const satisfies Record<keyof GatewaySetupBudgets, GatewaySpendLimitScope>;

export type ConnectedGatewaySetupGuideProps = {
  organizationId: string;
  config: GatewayConfig | null;
  projects: GatewayProject[];
  onFinish: () => void;
};

export function ConnectedGatewaySetupGuide({
  organizationId,
  config,
  projects,
  onFinish,
}: ConnectedGatewaySetupGuideProps) {
  const capture = usePostHogClientCapture();
  const progress = useGatewaySetupProgress({ organizationId, config });
  // Saving or skipping steps 3 and 4 leaves no saved state to resume from.
  const [finishedSteps, setFinishedSteps] = useState({
    budgets: false,
    teamInvite: false,
  });
  const activeStep = getActiveStep(progress.activeStep, finishedSteps);
  const { budgets, saveBudgets, ...budgetSaveState } =
    useGatewaySetupBudgets(organizationId);
  const captureBudgetChange = useCaptureGatewayBudgetChange(organizationId);
  const { spendBudgetUnavailableReason } =
    useGatewaySettingsAccess(organizationId);
  const { saveIngestion, isSaving } = useSaveGatewayIngestion(
    organizationId,
    "setup_guide",
  );
  const { recipients, inviteTeam, isInviting } =
    useGatewayTeamInvite(organizationId);

  // Funnel entry for the setup steps; the ref keeps it to one event per visit.
  const hasCapturedViewRef = useRef(false);
  useEffect(() => {
    if (hasCapturedViewRef.current) return;
    hasCapturedViewRef.current = true;
    capture("ai_gateway:setup_guide_viewed", { orgId: organizationId });
  }, [capture, organizationId]);

  if (progress.isPending) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  function finishBudgets({ isSkipped }: { isSkipped: boolean }) {
    capture("ai_gateway:setup_step_completed", {
      orgId: organizationId,
      step: "budgets",
      stepNumber: 3,
      isSkipped,
    });
    setFinishedSteps((steps) => ({ ...steps, budgets: true }));
  }

  async function handleSaveBudgets(nextBudgets: GatewaySetupBudgets) {
    const saved = await saveBudgets(nextBudgets);
    // Both budgets are saved together, so only those the user changed are captured.
    for (const budget of ["organization", "user"] as const) {
      if (!saved[budget]) continue;
      const change = toGatewaySpendLimitUpdate({
        loaded: budgets?.[budget] ?? null,
        hasSeveralSpendLimits: false,
        submitted: nextBudgets[budget],
      });
      if (change === undefined) continue;
      captureBudgetChange({
        surface: "setup_guide",
        scope: SETUP_BUDGET_SCOPES[budget],
        subjectCount: 1,
        spendLimit: change,
      });
    }
    if (saved.organization && saved.user) finishBudgets({ isSkipped: false });
  }

  function finishSetup({ isSkipped }: { isSkipped: boolean }) {
    capture("ai_gateway:setup_step_completed", {
      orgId: organizationId,
      step: "api_key",
      stepNumber: 5,
      isSkipped,
    });
    onFinish();
  }

  return (
    <CreateGatewayApiKeyDialogController
      organizationId={organizationId}
      onAfterCreatedKeyDismiss={() => finishSetup({ isSkipped: false })}
    >
      {({ openDialog: openCreateKeyDialog }) => (
        <ProviderDialogController
          organizationId={organizationId}
          surface="setup_guide"
          onAfterCreate={({ provider }) =>
            capture("ai_gateway:setup_step_completed", {
              orgId: organizationId,
              step: "credential",
              stepNumber: 2,
              provider,
            })
          }
        >
          {({ openAddDialog }) => (
            <GatewaySetupGuide
              activeStep={activeStep}
              config={config}
              projects={projects}
              firstConnection={progress.firstConnection}
              isSavingIngestion={isSaving}
              onSaveIngestion={async (settings) => {
                const isSaved = await saveIngestion(settings);
                if (isSaved) {
                  capture("ai_gateway:setup_step_completed", {
                    orgId: organizationId,
                    step: "ingestion",
                    stepNumber: 1,
                    ingestionMode: settings.ingestionMode,
                  });
                }
                return isSaved;
              }}
              onAddCredential={openAddDialog}
              budgetStep={{
                budgets,
                ...budgetSaveState,
                unavailableReason: spendBudgetUnavailableReason,
                onSave: handleSaveBudgets,
                onSkip: () => finishBudgets({ isSkipped: true }),
              }}
              recipients={recipients}
              isInviting={isInviting}
              onInvite={inviteTeam}
              onFinish={({ isSkipped }) => {
                capture("ai_gateway:setup_step_completed", {
                  orgId: organizationId,
                  step: "team_invite",
                  stepNumber: 4,
                  isSkipped,
                });
                setFinishedSteps((steps) => ({ ...steps, teamInvite: true }));
              }}
              onCreateKey={openCreateKeyDialog}
              onSkipKey={() => finishSetup({ isSkipped: true })}
            />
          )}
        </ProviderDialogController>
      )}
    </CreateGatewayApiKeyDialogController>
  );
}

function getActiveStep(
  savedStep: 1 | 2 | 3,
  finishedSteps: { budgets: boolean; teamInvite: boolean },
) {
  if (savedStep < 3) return savedStep;
  if (!finishedSteps.budgets) return 3;
  if (!finishedSteps.teamInvite) return 4;
  return 5;
}
