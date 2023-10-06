import Header from "@/src/components/layouts/header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { type FilterState } from "@/src/features/filters/types";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Loader } from "lucide-react";
import { numberFormatter } from "@/src/utils/numbers";

export const ReleaseTable = ({
  projectId,
  globalFilterState,
}: {
  projectId: string;
  globalFilterState: FilterState;
}) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "traces_parent_observation_scores",
    select: [
      { column: "value", agg: "AVG" },
      { column: "release", agg: null },
      { column: "value", agg: "COUNT" },
      { column: "scoreName", agg: null },
      { column: "duration", agg: "AVG" },
    ],
    filter:
      globalFilterState.map((f) => ({
        ...f,
        column: "timestamp",
      })) ?? [],
    groupBy: [
      { type: "string", column: "release" },
      { type: "string", column: "scoreName" },
    ],
    orderBy: [{ column: "release", direction: "DESC", agg: null }],
    limit: null,
  });

  return (
    <div className="md:container">
      <Header title="Releases" />
      <Card>
        <CardHeader className="relative">
          <CardTitle>Releases</CardTitle>
          <CardDescription>Count</CardDescription>
          {data.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of your recent releases.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Release</TableHead>
                <TableHead className="w-[100px]">Score Name</TableHead>
                <TableHead>Average Score</TableHead>
                <TableHead>Number of traces</TableHead>
                <TableHead className="text-right">
                  Average duration (ms)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data?.map((row) => (
                <TableRow
                  key={(row.release as string) + "-" + (row.name as string)}
                >
                  <TableCell className="font-medium">
                    {row.release ? (row.release as string) : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.name as string}
                  </TableCell>
                  <TableCell>
                    {numberFormatter(row.avgValue as number)}
                  </TableCell>
                  <TableCell>{row.countValue as number}</TableCell>
                  <TableCell className="text-right">
                    {numberFormatter(row.avgDuration as number)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
