import { useRouter } from "next/router";
import { useEffect } from "react";
import Page from "@/src/components/layouts/page";

export default function AutomationDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const triggerId = router.query.triggerId as string;
  const actionId = router.query.actionId as string;

  useEffect(() => {
    if (projectId && triggerId && actionId) {
      // Redirect to the new sidebar layout with the automation selected
      router.replace(
        `/project/${projectId}/automations?triggerId=${triggerId}&actionId=${actionId}`,
      );
    }
  }, [projectId, triggerId, actionId, router]);

  return (
    <Page
      headerProps={{
        title: "Redirecting...",
        breadcrumb: [
          {
            name: "Automations",
            href: `/project/${projectId}/automations`,
          },
        ],
      }}
    >
      <div className="py-4 text-center">
        Redirecting to automation details...
      </div>
    </Page>
  );
}
