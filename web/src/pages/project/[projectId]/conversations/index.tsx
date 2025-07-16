import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";

export default function ConversationsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <Page
      headerProps={{
        title: "Conversations",
        breadcrumb: [
          {
            name: "Conversations",
            href: `/project/${projectId}/conversations`,
          },
        ],
      }}
    >
      <div>content</div>
    </Page>
  );
}
