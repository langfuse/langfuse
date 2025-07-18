import Page from "@/src/components/layouts/page";
import { ConversationView } from "@/src/features/conversations/conversation-view/ConversationView";
import { useRouter } from "next/router";

export function ConversationViewPage() {
  const router = useRouter();
  const { conversationId, projectId } = router.query;

  if (!conversationId || !projectId) {
    return (
      <Page withPadding headerProps={{ title: "Conversation View" }}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-medium">Invalid session</div>
            <div className="text-sm text-muted-foreground">
              Session ID and Project ID are required.
            </div>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: String(conversationId),
        breadcrumb: [
          {
            name: "Conversations",
            href: `/project/${projectId}/conversations`,
          },
          {
            name: String(conversationId),
            href: `/project/${projectId}/conversations/${conversationId}`,
          },
        ],
      }}
    >
      <ConversationView
        sessionId={String(conversationId)}
        projectId={String(projectId)}
      />
    </Page>
  );
}
