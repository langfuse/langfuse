import { ConnectedOrgOverviewGraph } from "../OrgOverviewGraph/ConnectedOrgOverviewGraph";
import Header from "@/src/components/layouts/header";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { ErrorPage } from "@/src/components/error-page";
import { useState, type ComponentProps } from "react";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

export function OrganizationAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [order, setOrder] =
    useState<ComponentProps<typeof ConnectedOrgOverviewGraph>["order"]>(
      "billable",
    );

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <SearchInput
            placeholder="Search projects and clients"
            value={search}
            onChange={setSearch}
            onSubmit={setSearch}
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="w-40">
            <SelectInput<"all" | "active" | "inactive">
              value={activityFilter}
              onValueChange={setActivityFilter}
              aria-label="Filter by activity"
              placeholder="Filter by activity"
              options={[
                { value: "all", label: "All activity" },
                { value: "active", label: "Active only" },
                { value: "inactive", label: "Inactive only" },
              ]}
            />
          </div>
          <div className="w-52">
            <SelectInput<
              ComponentProps<typeof ConnectedOrgOverviewGraph>["order"]
            >
              value={order}
              onValueChange={setOrder}
              aria-label="Order projects"
              placeholder="Order projects"
              options={[
                { value: "billable", label: "Most billable units" },
                { value: "observations", label: "Most observations" },
                { value: "scores", label: "Most scores" },
                {
                  value: "activeEvaluationRules",
                  label: "Most active evaluation rules",
                },
                { value: "datasets", label: "Most datasets" },
                { value: "datasetItems", label: "Most dataset items" },
                { value: "activeMonitors", label: "Most active monitors" },
                { value: "prompts", label: "Most prompts" },
                { value: "name", label: "Project name A–Z" },
              ]}
            />
          </div>
        </div>
      </div>
      <div className="h-[70vh]">
        <ConnectedOrgOverviewGraph
          organizationId={organizationId}
          search={search}
          activityFilter={activityFilter}
          order={order}
        />
      </div>
    </div>
  );
}
