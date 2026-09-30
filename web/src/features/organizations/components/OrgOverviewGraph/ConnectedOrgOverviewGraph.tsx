import { OrgOverviewGraph } from "./OrgOverviewGraph";
import { type ComponentProps } from "react";
import { useOrganizationIngestionOverview } from "../../hooks/useOrganizationIngestionOverview";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { ErrorPage } from "@/src/components/error-page";

export function ConnectedOrgOverviewGraph({
  organizationId,
  search,
  activityFilter,
  order,
}: {
  organizationId: string;
  search: string;
  activityFilter: "all" | "active" | "inactive";
  order: NonNullable<ComponentProps<typeof OrgOverviewGraph>["order"]>;
}) {
  const { data, error, isLoading } =
    useOrganizationIngestionOverview(organizationId);

  if (error)
    return (
      <ErrorPage title="Unable to load analytics" message={error.message} />
    );
  if (!data) return <NoDataOrLoading isLoading={isLoading} />;

  return (
    <div className="flex h-[70vh] flex-col gap-2">
      {data.projects.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No projects in this organization.
        </p>
      ) : (
        <div className="border-border min-h-0 flex-1 overflow-hidden rounded-lg border">
          <OrgOverviewGraph
            data={data}
            search={search}
            activityFilter={
              activityFilter === "all" ? undefined : activityFilter
            }
            order={order}
          />
        </div>
      )}
    </div>
  );
}
