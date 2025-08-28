import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Tags, Trophy } from "lucide-react";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";

// Define the conversation turn type for the table
type ConversationTurn = {
  id: string;
  timestamp: Date;
  type: "user" | "assistant";
  content: string | null;
  tags: string[];
  metadata: unknown;
  scores: any[];
};

// Table columns for conversation turns
const conversationTurnsColumns: LangfuseColumnDef<ConversationTurn>[] = [
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }) => (
      <div className="font-mono text-xs">
        {row.original.timestamp.toLocaleString()}
      </div>
    ),
    size: 150,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant={row.original.type === "user" ? "default" : "secondary"}>
        {row.original.type}
      </Badge>
    ),
    size: 80,
  },
  {
    accessorKey: "content",
    header: "Content",
    cell: ({ row }) => (
      <div className="max-w-md truncate text-sm">
        {row.original.content || "-"}
      </div>
    ),
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tags.length > 0 ? (
          row.original.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: "scores",
    header: "Scores",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.scores.length > 0 ? (
          <GroupedScoreBadges scores={row.original.scores} maxVisible={3} />
        ) : (
          <span className="text-xs text-muted-foreground">No scores</span>
        )}
      </div>
    ),
    size: 200,
  },
];

export function ConversationSummaryPage() {
  const router = useRouter();
  const { conversationId, projectId } = router.query;

  // Fetch conversation traces data
  const conversation = api.conversation.getSessionTraces.useQuery(
    {
      sessionId: String(conversationId),
      projectId: String(projectId),
    },
    {
      enabled: Boolean(conversationId && projectId),
    },
  );

  // Fetch session data for additional metadata
  const sessionData = api.sessions.byIdWithScores.useQuery(
    {
      sessionId: String(conversationId),
      projectId: String(projectId),
    },
    {
      enabled: Boolean(conversationId && projectId),
    },
  );

  // Fetch scores for all traces in the conversation
  const traceScores = api.conversation.getScoresForTraces.useQuery(
    {
      projectId: String(projectId),
      traceIds: conversation.data?.traces.map((trace) => trace.id) || [],
    },
    {
      enabled: Boolean(
        conversationId && projectId && conversation.data?.traces?.length,
      ),
    },
  );

  if (!conversationId || !projectId) {
    return (
      <Page withPadding headerProps={{ title: "Conversation Summary" }}>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-medium">Invalid conversation</div>
            <div className="text-sm text-muted-foreground">
              Conversation ID and Project ID are required.
            </div>
          </div>
        </div>
      </Page>
    );
  }

  if (
    conversation.isLoading ||
    sessionData.isLoading ||
    traceScores.isLoading
  ) {
    return (
      <Page withPadding headerProps={{ title: "Conversation Summary" }}>
        <JsonSkeleton />
      </Page>
    );
  }

  if (conversation.isError) {
    return (
      <ErrorPage
        title="Could not load conversation"
        message={conversation.error.message}
      />
    );
  }

  if (sessionData.isError) {
    return (
      <ErrorPage
        title="Could not load session data"
        message={sessionData.error.message}
      />
    );
  }

  const conversationData = conversation.data;

  // Extract all unique tags from the conversation traces
  const allSessionTags = conversationData?.traces
    ? [...new Set(conversationData.traces.flatMap((msg) => msg.tags || []))]
    : [];

  // Create conversation turns data for the table
  const conversationTurns: ConversationTurn[] = conversationData?.traces
    ? conversationData.traces.flatMap((message) => {
        const turns: ConversationTurn[] = [];

        // Get scores for this trace
        const messageScores =
          traceScores.data?.scores.filter(
            (score) => score.traceId === message.id,
          ) || [];

        // Add user turn if input exists
        if (message.input) {
          turns.push({
            id: `${message.id}-input`,
            timestamp: message.timestamp,
            type: "user",
            content: message.input,
            tags: message.tags || [],
            metadata: message.metadata,
            scores: messageScores,
          });
        }

        // Add assistant turn if output exists
        if (message.output) {
          turns.push({
            id: `${message.id}-output`,
            timestamp: message.timestamp,
            type: "assistant",
            content: message.output,
            tags: message.tags || [],
            metadata: message.metadata,
            scores: messageScores,
          });
        }

        return turns;
      })
    : [];

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: `Summary - ${String(conversationId)}`,
        breadcrumb: [
          {
            name: "Conversations",
            href: `/project/${projectId}/conversations`,
          },
          {
            name: String(conversationId),
            href: `/project/${projectId}/conversations/${conversationId}`,
          },
          {
            name: "Summary",
            href: `/project/${projectId}/conversations/summary/${conversationId}`,
          },
        ],
      }}
    >
      <div className="space-y-6">
        {/* Basic Info Section */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Conversation Summary</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Conversation ID:</span>
                <span className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  {conversationId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Total Turns:</span>
                <span className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  {conversationTurns.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Users:</span>
                <span className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  {sessionData.data?.users.join(", ") || "No users"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Total Cost:</span>
                <span className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  ${sessionData.data?.totalCost.toFixed(4) || "0.0000"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Session Tags Section */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Tags className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Session Tags</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {allSessionTags.length > 0 ? (
              allSessionTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm">
                  {tag}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No tags found for this conversation.
              </p>
            )}
          </div>
        </div>

        {/* Session Scores Section */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Session Scores</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {sessionData.data?.scores && sessionData.data.scores.length > 0 ? (
              <GroupedScoreBadges scores={sessionData.data.scores} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No scores found for this session.
              </p>
            )}
          </div>
        </div>

        {/* Conversation Turns Table */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Conversation Turns</h3>
          <DataTable
            tableName="conversation-turns"
            columns={conversationTurnsColumns}
            data={{
              isLoading: false,
              isError: false,
              data: conversationTurns,
            }}
            pagination={{
              totalCount: conversationTurns.length,
              onChange: () => {}, // No pagination for now
              state: { pageIndex: 0, pageSize: conversationTurns.length },
            }}
          />
        </div>
      </div>
    </Page>
  );
}
