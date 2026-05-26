import { PlusIcon } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import Page from "@/src/components/layouts/page";
import { DataTableControlsProvider } from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { MonitorsTable } from "@/src/features/monitors/components/MonitorsTable";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

/** ListMonitorsPage displays the list of monitors for a project. */
export default function ListMonitorsPage() {
  const projectId = useProjectIdFromURL();
  /** hasCUDAccess gates the "New monitor" action button behind the monitors:CUD RBAC scope. */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });

  return (
    <MonitorPagePermissions scope="monitors:read">
      <DataTableControlsProvider
        tableName={monitorFilterConfig.tableName}
        defaultSidebarCollapsed={monitorFilterConfig.defaultSidebarCollapsed}
      >
        <Page
          headerProps={{
            title: "Monitors",
            help: {
              description:
                "Monitors evaluate a metric on a rolling window and emit alerts when a threshold is crossed.",
              href: "https://langfuse.com/docs/monitors",
            },
            actionButtonsRight: projectId ? (
              <>
                <FilterToggleButton />
                <AutomationButton projectId={projectId} />
                <ActionButton
                  icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
                  hasAccess={hasCUDAccess}
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
    </MonitorPagePermissions>
  );
}
