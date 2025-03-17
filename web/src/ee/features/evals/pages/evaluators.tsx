import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Plus } from "lucide-react";
import EvaluatorTable from "@/src/ee/features/evals/components/evaluator-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { ActionButton } from "@/src/components/ActionButton";
import { api } from "@/src/utils/api";
import {
  useEntitlementLimit,
  useHasEntitlement,
} from "@/src/features/entitlements/hooks";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { EvaluatorsOnboarding } from "@/src/components/onboarding/EvaluatorsOnboarding";

export default function EvaluatorsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();

  const evaluatorLimit = useEntitlementLimit(
    "model-based-evaluations-count-evaluators",
  );
  const hasEntitlement = useHasEntitlement("model-based-evaluations");
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
      enabled: !!projectId && hasEntitlement,
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

  if (!hasReadAccess || !hasEntitlement) {
    return <SupportOrUpgradePage />;
  }

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Evaluators",
          help: {
            description:
              "Use LLM-as-a-judge evaluators as practical addition to human annotation. Configure an evaluation prompt and a model as judge to evaluate incoming traces.",
            href: "https://langfuse.com/docs/scores/model-based-evals",
          },
        }}
        scrollable
      >
        <EvaluatorsOnboarding projectId={projectId} />
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Evaluators",
        help: {
          description:
            "Use LLM-as-a-judge evaluators as practical addition to human annotation. Configure an evaluation prompt and a model as judge to evaluate incoming traces.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        },
        tabsComponent: (
          <TabsBar value="evaluators">
            <TabsBarList>
              <TabsBarTrigger value="evaluators">Evaluators</TabsBarTrigger>
              <TabsBarTrigger value="templates" asChild>
                <Link href={`/project/${projectId}/evals/templates`}>
                  Templates
                </Link>
              </TabsBarTrigger>
              <TabsBarTrigger value="log" asChild>
                <Link href={`/project/${projectId}/evals/log`}>Log</Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
          <ActionButton
            hasAccess={hasWriteAccess}
            icon={<Plus className="h-4 w-4" />}
            variant="default"
            onClick={() => capture("eval_config:new_form_open")}
            href={`/project/${projectId}/evals/new`}
            limitValue={countsQuery.data?.configActiveCount ?? 0}
            limit={evaluatorLimit}
          >
            New evaluator
          </ActionButton>
        ),
      }}
    >
      <EvaluatorTable projectId={projectId} />
    </Page>
  );
}
