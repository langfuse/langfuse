import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { FeatureFlagToggle } from "@/src/features/featureFlags/components/FeatureFlagToggle";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Construction } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/src/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { useEffect, useState } from "react";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <FeatureFlagToggle
        featureFlag="analytics-alpha"
        whenDisabled={<AnalyticsDisabled />}
        whenEnabled={<DashboardEmbed projectId={projectId} />}
      />
    </div>
  );
}

const AnalyticsDisabled = () => (
  <Alert>
    <Construction className="h-4 w-4" />
    <AlertTitle>Analytics is in closed alpha</AlertTitle>
    <AlertDescription>
      <span>
        Read more about langfuse Analytics on langfuse.com. Reach out if you are
        interested in joining the closed alpha or have specific analytics needs.
      </span>
      {process.env.NEXT_PUBLIC_HOSTNAME !== "cloud.langfuse.com" ? (
        <span>
          <br />
          During the alpha, Analytics is only available for langfuse cloud
          users.
        </span>
      ) : null}
    </AlertDescription>
  </Alert>
);

const dashboards = [
  {
    title: "Usage",
    description: "Break down llm usage by project, observation, and user.",
    dashboardUrl:
      "https://lookerstudio.google.com/embed/reporting/434d92a5-cdbd-4835-b5c6-4a8590924e1d/page/p_refqjqlv7c",
    dashboardProjectUrl: (projectId: string) =>
      `https://lookerstudio.google.com/embed/reporting/434d92a5-cdbd-4835-b5c6-4a8590924e1d/page/p_refqjqlv7c?params=%7B%22df14%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
  },
  {
    title: "Latency",
    description: "Break down llm latency by project, observation, and user.",
    dashboardUrl:
      "https://lookerstudio.google.com/embed/reporting/826764d4-bf63-41d1-b461-fb791f0f0164/page/p_vf8v1b227c",
    dashboardProjectUrl: (projectId: string) =>
      `https://lookerstudio.google.com/embed/reporting/826764d4-bf63-41d1-b461-fb791f0f0164/page/p_vf8v1b227c?params=%7B%22df5%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
  },
  {
    title: "Scores",
    description:
      "Break down of scores by releases, versions, trace/observation types.",
    dashboardUrl:
      "https://lookerstudio.google.com/embed/reporting/94b1c194-7982-4e55-bd72-70eb01eafde8/page/ruJcD",
    dashboardProjectUrl: (projectId: string) =>
      `https://lookerstudio.google.com/embed/reporting/94b1c194-7982-4e55-bd72-70eb01eafde8/page/p_kpvgetsr9c?params=%7B%22df12%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22,%22df11%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
  },
] as const;

const DashboardEmbed = (props: { projectId: string }) => {
  const router = useRouter();
  const initialTab = router.query.dashboard as string | undefined;
  const [activeTab, setActiveTab] = useState(initialTab || dashboards[0].title);

  const handleTabChange = (value: string) => {
    //update the state
    setActiveTab(value);
    // update the URL query parameter
    void router.push({
      query: { dashboard: value },
      pathname: window.location.pathname,
    });
  };

  // if the query parameter changes, update the state
  useEffect(() => {
    setActiveTab(router.query.dashboard as string);
  }, [router.query.dashboard]);

  return (
    <>
      <Alert>
        <Construction className="h-4 w-4" />
        <AlertTitle>You are part of the closed alpha</AlertTitle>
        <AlertDescription>
          Please reach out if you have any problems or additional analytics
          needs. If you cannot access the Looker-powered dashboards, signing
          into your Google Account on another tab might help. A version for
          smaller screens is not yet available.
        </AlertDescription>
      </Alert>
      <Tabs
        defaultValue={dashboards[0].title}
        value={activeTab}
        onValueChange={handleTabChange}
        className="pt-10"
      >
        <TabsList>
          {dashboards.map((dashboard) => (
            <TabsTrigger key={dashboard.title} value={dashboard.title}>
              {dashboard.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {dashboards.map((dashboard) => (
          <TabsContent key={dashboard.title} value={dashboard.title}>
            <Card>
              <CardHeader>
                <CardTitle>{dashboard.title}</CardTitle>
                <CardDescription>{dashboard.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <iframe
                  width="100%"
                  src={
                    process.env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com"
                      ? dashboard.dashboardProjectUrl(props.projectId)
                      : dashboard.dashboardUrl
                  }
                  className="mt-5 aspect-[1.1]"
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
};
