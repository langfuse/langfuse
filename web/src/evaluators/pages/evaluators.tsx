import Page from "@/src/app/shell/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { Plus } from "lucide-react";
import EvaluatorTable from "@/src/evaluators/components/evaluator-table";
import { getEvalsTabs, EVALS_TABS } from "@/src/app/shell/navigation";
import { ActionButton } from "@/src/app/components/ActionButton";
import { api } from "@/src/app/utils/api";
import { useEntitlementLimit } from "@/src/entitlements";
import { SupportOrUpgradePage } from "@/src/ee/billing";
import { EvaluatorsOnboarding } from "@/src/app/onboarding/shared-components/EvaluatorsOnboarding";
import { ManageDefaultEvalModel } from "@/src/evaluators/components/manage-default-eval-model";
import { V4MigrationUpdateRequiredBadge } from "@/src/migrations/v4/upgrade-experience/V4MigrationDelayBadge";

export default function EvaluatorsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evaluatorLimit = useEntitlementLimit(
    "model-based-evaluations-count-evaluators",
  );
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:read",
  });

  // Fetch counts of evaluator configs and templates
  const countsQuery = api.evals.counts.useQuery(
    {
      projectId,
    },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const showOnboarding =
    countsQuery.data?.configCount === 0 &&
    countsQuery.data?.templateCount === 0;

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Evaluators",
          help: {
            description:
              "Configure a langfuse managed or custom evaluator to evaluate incoming traces.",
            href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
          },
        }}
        scrollable
      >
        <EvaluatorsOnboarding
          projectId={projectId}
          createEvaluatorAction={{
            label: "Create Evaluator",
            href: `/project/${projectId}/evals/legacy/new`,
          }}
        />
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Evaluators",
        titleBadges: <V4MigrationUpdateRequiredBadge />,
        help: {
          description:
            "Configure a langfuse managed or custom evaluator to evaluate incoming traces.",
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
        },
        tabsProps: {
          tabs: getEvalsTabs(projectId),
          activeTab: EVALS_TABS.CONFIGS,
        },
        actionButtonsRight: (
          <>
            <ManageDefaultEvalModel projectId={projectId} />
            <ActionButton
              hasAccess={hasWriteAccess}
              href={`/project/${projectId}/evals/legacy/new`}
              icon={<Plus className="icon-base text-icon-foreground" />}
              trackingEventName="eval_config:new_form_open"
              variant="default"
              usageLimit={
                typeof evaluatorLimit === "number"
                  ? {
                      current: countsQuery.data?.configActiveCount ?? 0,
                      max: evaluatorLimit,
                    }
                  : undefined
              }
            >
              Set up evaluator
            </ActionButton>
          </>
        ),
        actionButtonsRightClassName: "justify-end",
      }}
    >
      <EvaluatorTable projectId={projectId} />
    </Page>
  );
}
