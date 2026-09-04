import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { InnerEvaluatorForm } from "@/src/features/evals/components/inner-evaluator-form";
import {
  mapLegacyToModernTarget,
  isTraceTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { type PartialConfig } from "@/src/features/evals/types";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import { Callout } from "@/src/components/design-system/Callout/Callout";
import { DismissController } from "@/src/components/DismissController";
import { Separator } from "@/src/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { BotMessageSquare, ChevronDown, Zap } from "lucide-react";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import {
  useIsInAppAgentLauncherVisible,
  useInAppAiAgent,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useEvalUpgradeAssistantPlan } from "@/src/features/v4-migration/useV4UpgradeAssistantSupport";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useProjectV4SdkData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import {
  DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING_V3,
  DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING,
} from "@/src/features/evals/utils/evaluator-constants";
import { buildModernEvaluatorsUrl } from "@/src/features/v4-migration/evaluatorMigrationUrls";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";

const V4_DOCS_URL = "https://langfuse.com/docs/v4";
const EVAL_MIGRATION_DOCS_URL =
  "https://langfuse.com/faq/all/llm-as-a-judge-migration";

type LegacyEvalAction = "mark-inactive" | "delete";

export default function RemapEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evalConfigId = router.query.evaluator as string;
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(projectId);
  const capture = usePostHogClientCapture();
  const isInAppAgentLauncherVisible = useIsInAppAgentLauncherVisible();
  const { openAssistant, submit } = useInAppAiAgent();
  const sdk = useProjectV4SdkData({
    projectId,
    enabled: v4UpgradeUiEnabled && Boolean(projectId),
  });

  const evalCapabilities = useEvalCapabilities(projectId);
  const upgradePlan = useEvalUpgradeAssistantPlan({
    projectId,
    enabled: v4UpgradeUiEnabled && Boolean(projectId),
  });

  const [legacyAction, setLegacyAction] =
    useState<LegacyEvalAction>("mark-inactive");

  const returnFilter =
    typeof router.query.returnFilter === "string"
      ? router.query.returnFilter
      : undefined;

  // Fetch old eval config
  const { data: oldConfig, isLoading: isLoadingConfig } =
    api.evals.configById.useQuery(
      { projectId, id: evalConfigId },
      { enabled: !!projectId && !!evalConfigId },
    );

  // Fetch eval template
  const { data: evalTemplate, isLoading: isLoadingTemplate } =
    api.evals.templateById.useQuery(
      {
        projectId,
        id: oldConfig?.evalTemplateId ?? "",
      },
      { enabled: !!projectId && !!oldConfig?.evalTemplateId },
    );

  const utils = api.useUtils();

  const traceLevelEvalSummary = api.v4Transition.traceLevelEvalSummary.useQuery(
    { projectId },
    {
      enabled: v4UpgradeUiEnabled && Boolean(projectId),
      refetchOnWindowFocus: false,
    },
  );

  const redirectAfterSave = async () => {
    utils.evals.invalidate();
    const { data } = await traceLevelEvalSummary.refetch();
    const remainingCount = data?.traceLevelEvalCount;

    if (remainingCount === 0) {
      await router.push(buildModernEvaluatorsUrl(projectId));
      return;
    }

    const filterQuery = returnFilter
      ? `?filter=${encodeURIComponent(returnFilter)}`
      : "";
    await router.push(`/project/${projectId}/evals${filterQuery}`);
  };

  const { isV4: isV4BetaEnabled } = useReadPath();

  // Map old config to new config with modern target
  // Only copy scoreName - filters and variable mapping will be initialized fresh
  const mappedConfig: PartialConfig | null = useMemo(() => {
    if (!oldConfig) return null;

    return {
      projectId: oldConfig.projectId,
      evalTemplateId: oldConfig.evalTemplateId,
      scoreName: oldConfig.scoreName,
      targetObject: mapLegacyToModernTarget(oldConfig.targetObject),
      jobType: oldConfig.jobType,
      filter:
        oldConfig.targetObject === "trace"
          ? isV4BetaEnabled
            ? DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING
            : DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING_V3
          : [],
      variableMapping: [],
      sampling: oldConfig.sampling,
      delay: oldConfig.delay,
      status: "ACTIVE",
      // Always set to NEW for remapped evals - new eval types cannot run on existing data
      timeScope: ["NEW"],
    };
  }, [oldConfig, isV4BetaEnabled]);

  const handleFormSuccess = async () => {
    if (!oldConfig) return;
    await redirectAfterSave();
  };

  const handleUseAssistant = async () => {
    capture("v4_migration:migrate_evals_with_agent_clicked");
    const opened = openAssistant("v4_migration");
    if (!opened) return;
    await submit(upgradePlan.assistantPrompt, { newConversation: true });
  };

  const isLoading =
    isLoadingConfig ||
    isLoadingTemplate ||
    (v4UpgradeUiEnabled && sdk.status === "checking");

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Upgrade Evaluator",
        breadcrumb: [
          {
            name: "Running Evaluators",
            href: `/project/${projectId}/evals`,
          },
        ],
      }}
    >
      <div className="space-y-4">
        {v4UpgradeUiEnabled ? (
          <DismissController
            id={"v4-evaluator-upgrade:" + evalConfigId}
            family="callouts"
            ttlMs={7 * 24 * 60 * 60 * 1000}
          >
            {({ onDismiss }) => (
              <Callout
                variant="info"
                align="top"
                actions={
                  <>
                    {isInAppAgentLauncherVisible ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleUseAssistant}
                      >
                        <BotMessageSquare className="mr-1.5 h-4 w-4" />
                        Use Assistant to help with upgrade
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="secondary">
                      <a
                        href={V4_DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Docs
                      </a>
                    </Button>
                  </>
                }
                onDismiss={onDismiss}
              >
                <div className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-bold">
                      This evaluator needs an upgrade for Langfuse v4.
                    </span>{" "}
                    Evaluators are moving to observation-level. Upgrade this
                    configuration to keep its scores aligned with the v4 data
                    model.{" "}
                    <a
                      href={EVAL_MIGRATION_DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Learn more about evaluator upgrades
                    </a>
                    .
                  </span>
                </div>
              </Callout>
            )}
          </DismissController>
        ) : null}
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">
            Review your legacy evaluator on the left and configure the new eval
            settings on the right.{" "}
            <a
              href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-blue font-bold hover:opacity-80"
            >
              Follow our step-by-step guide
            </a>{" "}
            to upgrade successfully.
          </p>
        </div>

        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-6">
              <Skeleton className="h-[600px] w-full" />
              <Skeleton className="h-[600px] w-full" />
            </div>
          ) : !oldConfig || !evalTemplate ? (
            <Alert variant="destructive">
              <Alert.Description>
                Failed to load eval configuration or template.
              </Alert.Description>
            </Alert>
          ) : (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2px_minmax(0,1fr)] items-start">
              {/* LEFT: Read-only old config */}
              <div className="min-w-0 space-y-4 p-3">
                <div className="flex items-center gap-2 pb-2">
                  <h3 className="text-lg font-bold">
                    Legacy Configuration{" "}
                    {isTraceTarget(oldConfig.targetObject)
                      ? "(runs on traces)"
                      : ""}
                  </h3>
                  <span className="text-muted-foreground text-xs">
                    Read-only
                  </span>
                </div>
                <InnerEvaluatorForm
                  projectId={projectId}
                  evalTemplate={evalTemplate}
                  useDialog={false}
                  disabled={true}
                  existingEvaluator={oldConfig}
                  mode="edit"
                  hideTargetSection={false}
                  hideTargetSelection={true}
                  hideAdvancedSettings={true}
                  preventRedirect={true}
                  renderFooter={() => null}
                  evalCapabilities={evalCapabilities}
                  showPreviewTargetBadge={false}
                />
              </div>

              <Separator orientation="vertical" className="self-stretch" />

              {/* RIGHT: Editable new config form */}
              <div className="min-w-0 space-y-4 p-3">
                <h3 className="pb-2 text-lg font-bold">
                  New Configuration{" "}
                  {isTraceTarget(oldConfig.targetObject)
                    ? "(runs on observations)"
                    : ""}
                </h3>
                <InnerEvaluatorForm
                  projectId={projectId}
                  evalTemplate={evalTemplate}
                  useDialog={false}
                  existingEvaluator={mappedConfig ?? undefined}
                  onFormSuccess={handleFormSuccess}
                  mode="create"
                  hideTargetSection={false}
                  hideTargetSelection={true}
                  preventRedirect={true}
                  hideAdvancedSettings={true}
                  evalCapabilities={evalCapabilities}
                  showPreviewTargetBadge={false}
                  oldConfigId={evalConfigId}
                  sourceRuleAction={legacyAction}
                  hideRootObservationFilter={!isV4BetaEnabled}
                  renderFooter={({ isLoading, isSaveDisabled }) => (
                    <div className="flex w-full flex-col items-end gap-4">
                      <div className="flex items-center">
                        <Button
                          type="submit"
                          loading={isLoading}
                          disabled={isSaveDisabled}
                          className="mt-3 rounded-l-md rounded-r-none"
                        >
                          {legacyAction === "mark-inactive"
                            ? "Save & mark legacy inactive"
                            : "Save & delete legacy"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              disabled={isLoading}
                              className="mt-3 rounded-l-none rounded-r-md border-l-2"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setLegacyAction("mark-inactive")}
                            >
                              {legacyAction === "mark-inactive" && "✓ "}
                              Save & mark legacy inactive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setLegacyAction("delete")}
                            >
                              {legacyAction === "delete" && "✓ "}
                              Save & delete legacy
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
