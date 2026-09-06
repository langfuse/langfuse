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
import { useTranslations } from "next-intl";
import { type ComponentProps } from "react";

type MonitorHeaderProps = ComponentProps<typeof Page>["headerProps"];

/** ListMonitorsPage displays the list of monitors for a project, or an onboarding splash when the project has none. */
export default function ListMonitorsPage() {
  const t = useTranslations("operationsUi.monitors");
  const projectId = useProjectIdFromURL();
  const headerProps: MonitorHeaderProps = {
    title: t("pages.alerts"),
    help: { description: t("pages.help") },
  };

  const {
    isLoading,
    isSuccess,
    data: hasMonitors,
  } = api.monitors.hasAny.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId },
  );

  return (
    <MonitorPagePermissions scope="alerts:read">
      {!projectId || isLoading ? (
        <EmptyPage headerProps={headerProps} />
      ) : isSuccess && hasMonitors ? (
        <MainPage projectId={projectId} headerProps={headerProps} />
      ) : (
        <OnboardingPage projectId={projectId} headerProps={headerProps} />
      )}
    </MonitorPagePermissions>
  );
}

/** EmptyPage is an empty monitor page */
const EmptyPage = ({ headerProps }: { headerProps: MonitorHeaderProps }) => (
  <Page headerProps={headerProps}>{null}</Page>
);

/** OnboardingPage shows the onboarding message */
const OnboardingPage = ({
  projectId,
  headerProps,
}: {
  projectId: string;
  headerProps: MonitorHeaderProps;
}) => {
  /** hasCUDAccess is true if the user has permission to create monitors */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "alerts:CUD",
  });

  return (
    <Page headerProps={headerProps}>
      <MonitorsOnboarding projectId={projectId} hasCUDAccess={hasCUDAccess} />
    </Page>
  );
};

/** MainPage loads and displays the list of monitors  */
const MainPage = ({
  projectId,
  headerProps,
}: {
  projectId: string;
  headerProps: MonitorHeaderProps;
}) => {
  const t = useTranslations("operationsUi.monitors.pages");
  /** hasCUDAccess is true if the user has permission to create monitors */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "alerts:CUD",
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
                usageLimit={
                  typeof monitorEntitlementLimit === "number"
                    ? {
                        current: monitorCountQuery.data?.count,
                        max: monitorEntitlementLimit,
                      }
                    : undefined
                }
                href={`/project/${projectId}/alerts/new`}
                variant="default"
              >
                {t("newAlert")}
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
