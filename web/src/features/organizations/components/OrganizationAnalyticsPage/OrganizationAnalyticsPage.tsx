import { ConnectedOrgOverviewGraph } from "../OrgOverviewGraph/ConnectedOrgOverviewGraph";
import Header from "@/src/components/layouts/header";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { ErrorPage } from "@/src/components/error-page";

export function OrganizationAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();

  if (!internalFeaturesEnabled) {
    return (
      <ErrorPage title="Page not found" message="This page is not available." />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Header title="Organization Analytics" />
        <p className="text-muted-foreground text-sm">
          Explore ingestion activity across this organization’s projects and
          clients. Compare observations, scores, and billable units over the
          last seven days with the previous week.
        </p>
      </div>
      <ConnectedOrgOverviewGraph organizationId={organizationId} />
    </div>
  );
}
