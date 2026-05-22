import { PlusIcon } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import { ErrorPage } from "@/src/components/error-page";
import Page from "@/src/components/layouts/page";
import { DataTableControlsProvider } from "@/src/components/table/data-table-controls";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

import { FilterToggleButton } from "./FilterToggleButton";
import { MonitorsTable } from "./MonitorsTable";

export default function MonitorsPage() {
  const projectId = useProjectIdFromURL();
  const isMonitorsEnabled = useIsFeatureEnabled("monitors");
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });

  if (!isMonitorsEnabled) {
    return (
      <ErrorPage
        title="Page not found"
        message="This page does not exist or is not available for your account."
      />
    );
  }

  return (
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
  );
}
