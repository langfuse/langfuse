import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import Link from "next/link";

export default function Widgets() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  return (
    <Page
      headerProps={{
        title: "Dashboards",
        help: {
          description: "View and create dashboards for your project.",
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
      <h1>Hello Dashboards</h1>
    </Page>
  );
}
