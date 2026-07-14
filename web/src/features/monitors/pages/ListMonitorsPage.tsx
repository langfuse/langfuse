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

/** headerProps are shared by all of the ListMonitorPage headers */
const headerProps = {
  title: "Monitors",
  help: {
    description:
      "Monitors notify your team and automated workflows of sudden cost spikes, quality drops, latency changes, and other important changes on the system.",
  },
};

/** ListMonitorsPage displays the list of monitors for a project, or an onboarding splash when the project has none. */
export default function ListMonitorsPage() {
  const projectId = useProjectIdFromURL();

  const {
    isLoading,
    isSuccess,
    data: hasMonitors,
  } = api.monitors.hasAny.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId },
  );

  return (
    <MonitorPagePermissions scope="monitors:read">
      {!projectId || isLoading ? (
        <EmptyPage />
      ) : isSuccess && hasMonitors ? (
        <MainPage projectId={projectId} />
      ) : (
        <OnboardingPage projectId={projectId} />
      )}
    </MonitorPagePermissions>
  );
}

/** EmptyPage is an empty monitor page */
const EmptyPage = () => <Page headerProps={headerProps}>{null}</Page>;

/** OnboardingPage shows the onboarding message */
const OnboardingPage = ({ projectId }: { projectId: string }) => {
  /** hasCUDAccess is true if the user has permission to create monitors */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });

  return (
    <Page headerProps={headerProps}>
      <MonitorsOnboarding projectId={projectId} hasCUDAccess={hasCUDAccess} />
    </Page>
  );
};

/** MainPage loads and displays the list of monitors  */
const MainPage = ({ projectId }: { projectId: string }) => {
  /** hasCUDAccess is true if the user has permission to create monitors */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });

  /** monitorEntitlementLimit is the limit of the number of monitors that can be created for this org  */
  const monitorEntitlementLimit = useEntitlementLimit("monitor-count");

  /** monitorCountQuery returns the total number of monitors created for this org */
  const monitorCountQuery = api.monitors.count.useQuery(
    { projectId: projectId },
    { enabled: hasCUDAccess },
  );

  return (
    <DataTableControlsProvider
      tableName={monitorFilterConfig.tableName}
      defaultSidebarCollapsed={monitorFilterConfig.defaultSidebarCollapsed}
    >
      <Page
        headerProps={{
          ...headerProps,
          actionButtonsRight: (
            <>
              {/* Desktop uses the sidebar's own header toggle + collapsed
                  rail; this toggle only remains for the mobile stacked
                  layout. */}
              <FilterToggleButton className="md:hidden" />
              <AutomationButton projectId={projectId} />
              <ActionButton
                icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
                hasAccess={hasCUDAccess}
                limit={monitorEntitlementLimit}
                limitValue={monitorCountQuery.data?.count}
                href={`/project/${projectId}/monitors/new`}
                variant="default"
              >
                New Monitor
              </ActionButton>
            </>
          ),
        }}
      >
        <MonitorsTable />
      </Page>
    </DataTableControlsProvider>
  );
};
