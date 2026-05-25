import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { ErrorPage } from "@/src/components/error-page";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { MonitorForm } from "@/src/features/monitors";

export default function NewMonitorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const isEnabled = useIsFeatureEnabled("monitors");

  if (!isEnabled) {
    return <ErrorPage title="Not found" message="This page does not exist." />;
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: "New Monitor",
        breadcrumb: [{ name: "Monitors", href: `/project/${projectId}` }],
      }}
    >
      <MonitorForm projectId={projectId} />
    </Page>
  );
}
