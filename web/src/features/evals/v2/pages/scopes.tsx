import { Plus } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";

import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { CreateRunScopeDialog } from "@/src/features/evals/v2/components/CreateRunScopeDialog";
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
          actionButtonsRight: (
            <ActionButton
              hasAccess={hasWriteAccess}
              icon={<Plus className="h-4 w-4" />}
              className="-translate-y-2"
              onClick={() => setCreateDialogOpen(true)}
            >
              New run scope
            </ActionButton>
          ),
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
      {createDialogOpen ? (
        <CreateRunScopeDialog
          projectId={projectId}
          open
          onOpenChange={setCreateDialogOpen}
        />
      ) : null}
    </Page>
  );
}
