import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { DashboardTable } from "@/src/features/dashboard/components/DashboardTable";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import Link from "next/link";

export default function Dashboards() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  return (
    <Page
      headerProps={{
        title: "Dashboards",
        help: {
          description: "Manage and create dashboards for your project.",
          href: "TODO: Create documentation page", // TODO
        },
        tabsComponent: (
          <TabsBar value="dashboards">
            <TabsBarList>
              <TabsBarTrigger value="dashboards">Dashboards</TabsBarTrigger>
              <TabsBarTrigger value="widgets" asChild>
                <Link href={`/project/${projectId}/widgets`}>Widgets</Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
      }}
    >
      <DashboardTable />
    </Page>
  );
}
