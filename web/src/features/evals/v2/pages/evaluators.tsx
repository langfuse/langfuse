import { Plus } from "lucide-react";
import { useRouter } from "next/router";

import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { EvaluatorOverviewTable } from "@/src/features/evals/v2/components/EvaluatorOverviewTable";
import {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";

export default function EvaluatorsV2Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  if (!hasReadAccess) return <SupportOrUpgradePage />;

  return (
    <Page
      headerProps={{
        title: "Evaluators v2",
        help: {
          description:
            "Create reusable evaluator definitions and connect them to one or more run scopes.",
        },
        tabsProps: {
          tabs: getEvalsV2Tabs(projectId),
          activeTab: EVALS_V2_TABS.EVALUATORS,
          actionButtonsRight: (
            <ActionButton
              hasAccess={hasWriteAccess}
              icon={<Plus className="h-4 w-4" />}
              className="-translate-y-2"
              onClick={() => router.push(`/project/${projectId}/evals/v2/new`)}
            >
              New evaluator
            </ActionButton>
          ),
        },
      }}
    >
      <EvaluatorOverviewTable
        projectId={projectId}
        hasWriteAccess={hasWriteAccess}
      />
    </Page>
  );
}
