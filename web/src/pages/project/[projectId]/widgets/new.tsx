import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { api } from "@/src/utils/api";
import { type QueryType } from "@/src/features/query";

export default function NewWidget() {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // Define timestamps for the query
  const toTimestamp = new Date("2025-04-04");
  const fromTimestamp = new Date("2025-03-01");

  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tracesQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: isAdmin, // Only run query if isAdmin is true and projectId exists
    },
  );

  const transformedTraces =
    traces.data?.map((item: any) => ({
      name: item.name ? (item.name as string) : "Unknown",
      total: Number(item.count_count),
    })) ?? [];

  if (!isAdmin) {
    return null; // Blank page for non-admins
  }

  return (
    <Page
      headerProps={{
        title: "New Widget",
        help: {
          description: "Create a new widget",
        },
      }}
    >
      <div className="flex h-full flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Traces</CardTitle>
            <CardDescription>
              Traces grouped by name for the last 30 days.
            </CardDescription>
          </CardHeader>
          {traces.data ? (
            <CardContent>
              <ChartContainer
                config={{
                  total: {
                    theme: {
                      light: "hsl(var(--chart-1))",
                      dark: "hsl(var(--chart-1))",
                    },
                  },
                }}
              >
                <BarChart
                  accessibilityLayer={true}
                  data={transformedTraces}
                  layout={"vertical"}
                >
                  <XAxis
                    type="number"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Bar
                    dataKey="total"
                    radius={[0, 4, 4, 0]}
                    className="fill-[--color-total]"
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value: number) =>
                          Intl.NumberFormat("en-US").format(value).toString()
                        }
                      />
                    }
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          ) : (
            <h2>Loading...</h2>
          )}
        </Card>
      </div>
    </Page>
  );
}
