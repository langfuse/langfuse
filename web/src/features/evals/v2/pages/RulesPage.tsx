import { useState } from "react";
import { Plus } from "@langfuse/icons";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/Page";
import { Button } from "@/src/components/ui/button";
import { PopoverController } from "@/src/components/ui/popover";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { CreateRuleDialog } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import {
  TraceRuleIdleTime,
  traceIdleHeaderLabel,
} from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/components/TraceRuleIdleTime/TraceRuleIdleTime";
import { api } from "@/src/utils/api";
import { RulesTable } from "@/src/features/evals/v2/components/Rules/RulesTable/RulesTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  EVALS_V2_TABS,
  getEvalsV2Tabs,
} from "@/src/features/navigation/utils/evals-v2-tabs";
import { V4MigrationUpdateRequiredBadge } from "@/src/features/v4-migration/V4MigrationDelayBadge";

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
  const idleTime = api.topics.tracingReadinessSettings.useQuery({ projectId });

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
          <div className="flex items-center gap-2">
            <PopoverController
              align="end"
              contentClassName="w-auto"
              disabled={false}
              modal={false}
              renderContent={() => <TraceRuleIdleTime projectId={projectId} />}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border-contrast"
                  >
                    {traceIdleHeaderLabel(
                      idleTime.data?.traceIdleMs,
                      idleTime.isPending,
                    )}
                  </Button>
                </Trigger>
              )}
            </PopoverController>
            <Button
              disabled={!hasWriteAccess}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size="base" color="default" __rawClassName="mr-2" /> New
              rule
            </Button>
          </div>
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
