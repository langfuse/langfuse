import { ConnectedOrgOverviewGraph } from "../OrgOverviewGraph/ConnectedOrgOverviewGraph";
import Header from "@/src/components/layouts/header";

export function OrganizationAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
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
