import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { RunScopesOverviewTable } from "@/src/features/evals/v2/components/RunScopesOverviewTable";
import { TablePeekViewRunScopeDetail } from "@/src/features/evals/v2/components/RunScopePeekView";
import {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";

export default function RunScopesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const peekNavigation = usePeekNavigation({ queryParams: ["editScope"] });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  return (
    <Page
      headerProps={{
        title: "Evaluators v2",
        help: {
          description:
            "Run scopes define which data evaluators run on. Scopes are shared: multiple evaluators can reuse the same scope, and changes apply to all of them.",
        },
        tabsProps: {
          tabs: getEvalsV2Tabs(projectId),
          activeTab: EVALS_V2_TABS.RUN_SCOPES,
        },
      }}
    >
      <RunScopesOverviewTable
        projectId={projectId}
        hasWriteAccess={hasWriteAccess}
      />
      <TablePeekViewRunScopeDetail
        itemType="RUN_SCOPE"
        projectId={projectId}
        closePeek={peekNavigation.closePeek}
      />
    </Page>
  );
}
