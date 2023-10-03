import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";

import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { ReleaseTable } from "../../../features/dashboard/components/ReleaseTable";
import { TokenChart } from "../../../features/dashboard/components/TokenChart";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [filterState, setFilterState] = useQueryFilterState();

  const globalFilterCols: ColumnDefinition[] = [
    { name: "startTime", type: "datetime", internal: 'o."start_time"' },
  ];

  const initial = [
    {
      column: "startTime",
      operator: "<",
      type: "datetime",
      value: new Date(),
    },
    {
      column: "startTime",
      operator: ">",
      type: "datetime",
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ] as const;

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <FilterBuilder
        columns={globalFilterCols}
        filterState={[...filterState] ?? []}
        onChange={setFilterState}
      />
      <TokenChart
        projectId={projectId}
        globalFilterState={[...filterState, ...initial]}
      />
      <ReleaseTable
        projectId={projectId}
        globalFilterState={[...filterState, ...initial]}
      />
    </div>
  );
}
