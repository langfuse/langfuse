import Header from "@/src/components/layouts/header";
import { NewChartButton } from "@/src/features/charts/NewChartButton";
import { CustomTimeSeriesChart } from "@/src/features/dashboard/components/CustomTimeSeriesChart";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function Analytics() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const charts = api.dashboard.list.useQuery({ projectId });

  return (
    <div>
      <Header title="Custom Charts" />
      {charts.isLoading ? (
        <span>Loading...</span>
      ) : charts.isError ? (
        <span>{charts.error.message}</span>
      ) : (
        charts.data.map((chart) => (
          <CustomTimeSeriesChart key={chart.id} projectId={projectId} chartConfig={chart} />
        ))
      )}
      <NewChartButton projectId={projectId} className="mt-4" />
    </div>
  );
}
