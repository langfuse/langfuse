import { OrgOverviewGraph } from "./OrgOverviewGraph";
import { useOrganizationIngestionOverview } from "../../hooks/useOrganizationIngestionOverview";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export function ConnectedOrgOverviewGraph({
  organizationId,
}: {
  organizationId: string;
}) {
  const data = useOrganizationIngestionOverview(organizationId);

  if (!data) return <NoDataOrLoading isLoading />;

  return (
    <div className="flex h-[70vh] flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        Preview — synthetic ingestion metrics, not live data.
      </p>
      {data.projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No projects in this organization.
        </p>
      ) : (
        <div className="border-border min-h-0 flex-1 overflow-hidden rounded-lg border">
          <OrgOverviewGraph data={data} />
        </div>
      )}
    </div>
  );
}
