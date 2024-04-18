import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/router";

export default function PosthogIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  return (
    <div className="md:container">
      <Header
        title="PostHog Integration"
        breadcrumb={[
          { name: "Settings", href: "/project/[projectId]/settings" },
        ]}
        actionButtons={
          <Button asChild variant="secondary">
            <Link href="https://langfuse.com/docs/analytics/posthog">
              Integration Docs
            </Link>
          </Button>
        }
        status="inactive"
      />
      <p className="mb-4 text-sm text-gray-700">
        We have teamed up with PostHog (OSS product analytics) to make Langfuse
        Events/Metrics available in your Posthog Dashboards. While in Beta, this
        integration syncs metrics on a daily schedule to PostHog.
      </p>
      <div className="flex flex-col gap-10"></div>
    </div>
  );
}
