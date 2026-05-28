import { PlusIcon } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { DataTableControlsProvider } from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { MonitorsOnboarding } from "@/src/features/monitors/components/MonitorsOnboarding";
import { MonitorsTable } from "@/src/features/monitors/components/MonitorsTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

/** monitorsPageHelp is the docs-link header help shown on both the splash and table renders. */
const monitorsPageHelp = {
  description:
    "Monitors evaluate a metric on a rolling window and emit alerts when a threshold is crossed.",
  href: "https://langfuse.com/docs/monitors",
};

/** ListMonitorsPage displays the list of monitors for a project, or an onboarding splash when the project has none. */
export default function ListMonitorsPage() {
  const projectId = useProjectIdFromURL();
  /** hasCUDAccess gates the "New monitor" action button behind the monitors:CUD RBAC scope. */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });
  const monitorLimit = useEntitlementLimit("monitor-count");
  const monitorCountQuery = api.monitors.count.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId && hasCUDAccess },
  );
  /** monitorsHasAnyQuery drives the splash-vs-table render; project-scoped so the splash appears on fresh projects regardless of sibling-project monitors. */
  const monitorsHasAnyQuery = api.monitors.hasAny.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId },
  );
  const showOnboarding = monitorsHasAnyQuery.data === false;

  return (
    <MonitorPagePermissions scope="monitors:read">
      {showOnboarding && projectId ? (
        <Page headerProps={{ title: "Monitors", help: monitorsPageHelp }}>
          <MonitorsOnboarding projectId={projectId} />
        </Page>
      ) : (
        <DataTableControlsProvider
          tableName={monitorFilterConfig.tableName}
          defaultSidebarCollapsed={monitorFilterConfig.defaultSidebarCollapsed}
        >
          <Page
            headerProps={{
              title: "Monitors",
              help: monitorsPageHelp,
              actionButtonsRight: projectId ? (
                <>
                  <FilterToggleButton />
                  <AutomationButton projectId={projectId} />
                  <ActionButton
                    icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
                    hasAccess={hasCUDAccess}
                    limit={monitorLimit}
                    limitValue={monitorCountQuery.data?.count}
                    href={`/project/${projectId}/monitors/new`}
                    variant="default"
                  >
                    New monitor
                  </ActionButton>
                </>
              ) : null,
            }}
          >
            <MonitorsTable />
          </Page>
        </DataTableControlsProvider>
      )}
    </MonitorPagePermissions>
  );
}
