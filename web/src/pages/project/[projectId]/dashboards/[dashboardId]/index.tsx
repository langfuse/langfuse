import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";

export default function Dashboard() {
  const router = useRouter();
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId: string;
  };

  // Fetch the dashboard details
  const { data: dashboardData, isLoading: isDashboardLoading } =
    api.dashboard.getDashboard.useQuery(
      {
        projectId,
        dashboardId,
      },
      {
        enabled: Boolean(projectId) && Boolean(dashboardId),
      },
    );

  if (isDashboardLoading) {
    return <div>Loading...</div>;
  }

  if (!dashboardData) {
    return <div>Dashboard not found</div>;
  }

  debugger;

  return (
    <Page
      headerProps={{
        title: dashboardData.name,
        help: {
          description: dashboardData.description,
        },
      }}
    >
      <div>{dashboardData.name}</div>
      <div>{dashboardData.description}</div>
    </Page>
  );
}
