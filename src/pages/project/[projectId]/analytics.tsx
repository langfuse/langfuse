import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
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
import { openChat } from "@/src/features/support-chat/chat";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { env } from "@/src/env.mjs";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Analytics" />
      {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU" ? (
        <DashboardEmbed projectId={projectId} />
      ) : (
        <AnalyticsDisabled />
      )}
    </div>
  );
}

const AnalyticsDisabled = () => (
  <Alert>
    <Construction className="h-4 w-4" />
    <AlertTitle>Analytics alpha is only available on Langfuse Cloud</AlertTitle>
    <AlertDescription>
      While we are in the alpha phase, Analytics is only available for Langfuse
      Cloud{env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ? " EU" : ""} users
      as we use Looker to power the dashboards. An open source version is work
      in progress.
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
      `https://lookerstudio.google.com/embed/reporting/94b1c194-7982-4e55-bd72-70eb01eafde8/page/ruJcD?params=%7B%22df12%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22,%22df11%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580${projectId}%22%7D`,
  },
] as const;

const DashboardEmbed = (props: { projectId: string }) => {
  const [dashboard, setDashboard] = useQueryParam(
    "dashboard",
    withDefault(StringParam, dashboards[0].title),
  );

  return (
    <>
      <Alert>
        <Construction className="h-4 w-4" />
        <AlertTitle>Analytics is in alpha</AlertTitle>
        <AlertDescription className="mt-2">
          Limitations:
          <ul className="mb-2 list-inside list-disc">
            <li>
              During the alpha we use Looker to power the dashboards. An open
              source version is work in progress.
            </li>
            <li>
              Looker requires to be signed in with a Google Account with the
              same email address as your Langfuse account.
            </li>
            <li>
              At times, high traffic may cause the dashboards to load slowly.
            </li>
            <li>Not optimized for mobile screens.</li>
          </ul>
          If you run into any issues, please let us know. We are adding new
          dashboards on an ongoing bases. Reach out to us via{" "}
          <a href="#" onClick={() => openChat()} className="underline">
            chat
          </a>{" "}
          to request any additional charts.
        </AlertDescription>
      </Alert>
      <Tabs
        defaultValue={dashboards[0].title}
        value={dashboard}
        onValueChange={setDashboard}
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
                    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU"
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
