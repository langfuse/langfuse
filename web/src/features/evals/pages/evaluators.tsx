import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Plus } from "lucide-react";
import EvaluatorTable from "@/src/features/evals/components/evaluator-table";
import {
  getEvalsTabs,
  EVALS_TABS,
} from "@/src/features/navigation/utils/evals-tabs";
import { ActionButton } from "@/src/components/ActionButton";
import { api } from "@/src/utils/api";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { EvaluatorsOnboarding } from "@/src/components/onboarding/EvaluatorsOnboarding";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { V4MigrationModal } from "@/src/features/v4-migration/V4MigrationModal";

export default function EvaluatorsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evaluatorLimit = useEntitlementLimit(
    "model-based-evaluations-count-evaluators",
  );
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
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
        <EvaluatorsOnboarding projectId={projectId} />
      </Page>
    );
  }

  return (
    <>
      <V4MigrationModal />
      <Page
        headerProps={{
          title: "Evaluators",
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
                href={`/project/${projectId}/evals/new`}
                icon={<Plus className="h-4 w-4" />}
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
        }}
      >
        <EvaluatorTable projectId={projectId} />
      </Page>
    </>
  );
}
