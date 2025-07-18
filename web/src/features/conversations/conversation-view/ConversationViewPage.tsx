import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";

export function ConversationViewPage() {
  const router = useRouter();

  const projectId = router.query.projectId as string;
  const conversationId = router.query.conversationId as string;

  return (
    <Page
      headerProps={{
        title: conversationId,
        breadcrumb: [
          {
            name: "Conversations",
            href: `/project/${projectId}/conversations`,
          },
          {
            name: conversationId,
            href: `/project/${projectId}/conversations/${conversationId}`,
          },
        ],
      }}
    >
      <div>ConversationViewPage</div>
      <div>{conversationId}</div>
      <div>{projectId}</div>
    </Page>
  );
}
