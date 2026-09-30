import { OrgOverviewGraph } from "./OrgOverviewGraph";
import { type ComponentProps } from "react";
import { useOrganizationIngestionOverview } from "../../hooks/useOrganizationIngestionOverview";

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

  return (
    <OrgOverviewGraph
      data={data}
      error={error}
      isLoading={isLoading}
      search={search}
      activityFilter={activityFilter === "all" ? undefined : activityFilter}
      order={order}
    />
  );
}
