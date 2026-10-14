import { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/router";
import Page from "@/src/app/shell/layouts/page";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { SupportOrUpgradePage } from "@/src/ee/billing";
import { CreateRuleDialog } from "@/src/evaluators/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import { RulesTable } from "@/src/evaluators/v2/components/Rules/RulesTable/RulesTable";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { EVALS_V2_TABS, getEvalsV2Tabs } from "@/src/app/shell/navigation";
import { V4MigrationUpdateRequiredBadge } from "@/src/migrations/v4/upgrade-experience/V4MigrationDelayBadge";

export function RulesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [createOpen, setCreateOpen] = useState(false);
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });

  if (!hasReadAccess) return <SupportOrUpgradePage />;

  return (
    <Page
      headerProps={{
        title: "Rules",
        titleBadges: <V4MigrationUpdateRequiredBadge />,
        help: {
          description:
            "Rules define which incoming observations reusable evaluators run on.",
        },
        actionButtonsRight: (
          <Button
            disabled={!hasWriteAccess}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="icon-base text-icon-foreground mr-2" /> New rule
          </Button>
        ),
        tabsProps: {
          tabs: getEvalsV2Tabs(projectId),
          activeTab: EVALS_V2_TABS.RULES,
        },
      }}
    >
      <RulesTable projectId={projectId} hasWriteAccess={hasWriteAccess} />
      {createOpen ? (
        <CreateRuleDialog
          projectId={projectId}
          open
          onOpenChange={setCreateOpen}
          successNotification="toast"
        />
      ) : null}
    </Page>
  );
}
