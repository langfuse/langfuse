import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { FeatureFlagToggle } from "@/src/features/featureFlags/components/FeatureFlagToggle";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Construction } from "lucide-react";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="container">
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

const DashboardEmbed = (props: { projectId: string }) => {
  const reportUrl =
    "https://lookerstudio.google.com/embed/reporting/434d92a5-cdbd-4835-b5c6-4a8590924e1d/page/p_refqjqlv7c";

  const filteredReportUrl =
    process.env.NEXT_PUBLIC_HOSTNAME === "cloud.langfuse.com"
      ? reportUrl +
        "?params=%7B%22df14%22:%22include%25EE%2580%25800%25EE%2580%2580IN%25EE%2580%2580" +
        props.projectId +
        "%22%7D"
      : reportUrl;

  return (
    <>
      <Alert>
        <Construction className="h-4 w-4" />
        <AlertTitle>You are part of the closed alpha</AlertTitle>
        <AlertDescription>
          Please reach out if you have any problems or additional analytics
          needs. If you cannot access the Looker-powered dashboards, please sign
          into your Google Account in another tab and try again. A version for
          smaller screens is not yet available.
        </AlertDescription>
      </Alert>
      <iframe
        width="100%"
        src={filteredReportUrl}
        className="mt-5 aspect-[1.1]"
      />
    </>
  );
};
