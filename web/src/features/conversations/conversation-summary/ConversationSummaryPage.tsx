import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  Tags,
  Trophy,
  MessageSquare,
  Info,
  Clock,
  Zap,
  TrendingUp,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { DjbView } from "@/src/components/ui/DjbView";

// Score explanations mapping
const SCORE_EXPLANATIONS: Record<
  string,
  { category: string; description: string }
> = {
  // Response Time Related
  "avg-ttft": {
    category: "Response Time",
    description: "Average time to first token (in seconds)",
  },
  "hi-ttft": {
    category: "Response Time",
    description: "Highest time to first token (slowest response) (in seconds)",
  },
  "lo-ttft": {
    category: "Response Time",
    description: "Lowest time to first token (fastest response) (in seconds)",
  },

  // Related to Questions
  "usr-questions": {
    category: "Questions",
    description:
      "Total number of questions asked by the user in this conversation",
  },
  "usr-avg-questions": {
    category: "Questions",
    description: "Average number of questions asked by the user per turn",
  },
  "bot-questions": {
    category: "Questions",
    description:
      "Total number of questions asked by the bot in this conversation",
  },
  "bot-avg-questions": {
    category: "Questions",
    description: "Average number of questions asked by the bot per turn",
  },

  // Topics
  "avg-topic-msgs": {
    category: "Topics",
    description: "Average message count per topic",
  },
  "total-topics": {
    category: "Topics",
    description: "Total number of topics covered",
  },
  "avg-int-topic-msgs": {
    category: "Topics",
    description: "Average message count per internal topic",
  },
  "total-int-topics": {
    category: "Topics",
    description: "Total number of internal topics covered",
  },

  // Word Count
  "usr-avg-words": {
    category: "Word Count",
    description: "Average number of words per user message",
  },
  "usr-tot-words": {
    category: "Word Count",
    description: "Total number of words from the user",
  },
  "bot-avg-words": {
    category: "Word Count",
    description: "Average number of words per bot message",
  },
  "bot-tot-words": {
    category: "Word Count",
    description: "Total number of words from the bot",
  },
  "bot-hi-words": {
    category: "Word Count",
    description: "Longest bot message word count",
  },
  "bot-lo-words": {
    category: "Word Count",
    description: "Shortest bot message word count",
  },

  // Cost
  "avg-cost-trace": {
    category: "Cost",
    description: "Average cost in USD for each DJB message",
  },
};

// Score detail card component
const ScoreDetailCard = ({ score }: { score: any }) => {
  const explanation = SCORE_EXPLANATIONS[score.name];
  const value = score.value ?? score.stringValue ?? "N/A";

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {explanation?.category || "Other"}
            </Badge>
            <span className="font-mono text-sm font-semibold">
              {score.name}
            </span>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">
            {explanation?.description || "No description available"}
          </p>
          {score.comment && (
            <div className="mt-2 rounded border-l-2 border-blue-500 bg-background p-2">
              <p className="mb-1 text-xs text-muted-foreground">Comment:</p>
              <p className="text-sm">{score.comment}</p>
            </div>
          )}
        </div>
        <div className="ml-4 text-right">
          <div className="text-lg font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{score.dataType}</div>
        </div>
      </div>
    </div>
  );
};

// TTFT Metrics Display Component
const TTFTMetricsDisplay = ({ scores }: { scores: any[] }) => {
  // Extract TTFT values from scores
  const avgTTFT = scores.find((score) => score.name === "avg-ttft");
  const hiTTFT = scores.find((score) => score.name === "hi-ttft");
  const loTTFT = scores.find((score) => score.name === "lo-ttft");

  // If no TTFT scores are available, don't render the component
  if (!avgTTFT && !hiTTFT && !loTTFT) {
    return null;
  }

  const formatTTFTValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(3)}s`;
  };

  return (
    <div className="rounded-lg border bg-gradient-to-r from-blue-50 to-indigo-50 p-6 dark:from-blue-950/20 dark:to-indigo-950/20">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          Time to First Token (TTFT) Metrics
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Average TTFT */}
        <div className="flex flex-col items-center rounded-lg bg-white/60 p-4 shadow-sm dark:bg-gray-800/60">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Average
            </span>
          </div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatTTFTValue(avgTTFT?.value)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Mean response time
          </div>
        </div>

        {/* Fastest TTFT (Lowest) */}
        <div className="flex flex-col items-center rounded-lg bg-white/60 p-4 shadow-sm dark:bg-gray-800/60">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Fastest
            </span>
          </div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">
            {formatTTFTValue(loTTFT?.value)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Best response time
          </div>
        </div>

        {/* Slowest TTFT (Highest) */}
        <div className="flex flex-col items-center rounded-lg bg-white/60 p-4 shadow-sm dark:bg-gray-800/60">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Slowest
            </span>
          </div>
          <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
            {formatTTFTValue(hiTTFT?.value)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Worst response time
          </div>
        </div>
      </div>
    </div>
  );
};

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

// Helper component for score column headers with tooltips
const ScoreHeader = ({
  name,
  explanation,
}: {
  name: string;
  explanation?: { category: string; description: string };
}) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-help items-center gap-1">
          <span className="font-mono text-xs">{name}</span>
          <Info className="h-3 w-3" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          {explanation && (
            <>
              <p className="text-xs font-semibold">{explanation.category}</p>
              <p className="text-xs">{explanation.description}</p>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// Create dynamic columns based on available scores
const createConversationTurnsColumns = (
  allScores: any[],
): LangfuseColumnDef<ConversationTurn>[] => {
  // Get unique score names from all turns
  const uniqueScoreNames = [
    ...new Set(allScores.flatMap((scores) => scores.map((s: any) => s.name))),
  ];

  const baseColumns: LangfuseColumnDef<ConversationTurn>[] = [
    {
      accessorKey: "timestamp",
      header: "Time",
      cell: ({ row }) => (
        <div className="font-mono text-xs">
          {row.original.timestamp.toLocaleString()}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: "type",
      header: "Speaker",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3 w-3" />
          <Badge
            variant={row.original.type === "user" ? "default" : "secondary"}
          >
            {row.original.type === "user" ? "User" : "Assistant"}
          </Badge>
        </div>
      ),
      size: 100,
    },
    {
      accessorKey: "content",
      header: "Message",
      cell: ({ row }) => {
        const content = row.original.content;
        if (!content)
          return <span className="text-muted-foreground">No content</span>;

        try {
          // Try to parse as JSON for rich content
          const parsed = JSON.parse(content);
          if (typeof parsed === "string") {
            return (
              <div className="max-w-2xl">
                <DjbView
                  markdown={parsed}
                  title=""
                  customCodeHeaderClassName="bg-secondary"
                />
              </div>
            );
          }
        } catch {
          // If not JSON or parsing fails, display as plain text
        }

        return (
          <div className="max-w-2xl whitespace-pre-wrap text-sm">{content}</div>
        );
      },
      size: 400,
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
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      ),
      size: 150,
    },
  ];

  // Add columns for each unique score
  const scoreColumns: LangfuseColumnDef<ConversationTurn>[] =
    uniqueScoreNames.map((scoreName) => ({
      accessorKey: `score_${scoreName}`,
      header: () => (
        <ScoreHeader
          name={scoreName}
          explanation={SCORE_EXPLANATIONS[scoreName]}
        />
      ),
      cell: ({ row }) => {
        const score = row.original.scores.find(
          (s: any) => s.name === scoreName,
        );
        if (!score)
          return <span className="text-xs text-muted-foreground">-</span>;

        const value = score.value ?? score.stringValue ?? "N/A";
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help font-mono text-sm font-semibold">
                  {value}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <p className="text-xs font-semibold">{scoreName}</p>
                  <p className="text-xs">
                    {SCORE_EXPLANATIONS[scoreName]?.description ||
                      "No description available"}
                  </p>
                  {score.comment && (
                    <p className="mt-1 border-t pt-1 text-xs italic">
                      Comment: {score.comment}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      size: 80,
    }));

  return [...baseColumns, ...scoreColumns];
};

// Compact Scores Grid Component
const CompactScoresGrid = ({
  conversationTurns,
}: {
  conversationTurns: ConversationTurn[];
}) => {
  // Get the specific scores we want to show
  const targetScores = [
    "openai-mod-msg",
    "self-harm-check",
    "Bill:overall-rating",
    "Bill:gears",
    "last-milestone",
    "internal-habit-loop",
    "internal-topic",
    "internal-action",
  ];

  // Helper function to extract subtopic tags
  const getSubtopics = (turn: ConversationTurn): string[] => {
    return turn.tags
      .filter((tag) => tag.startsWith("subtopic:"))
      .map((tag) => tag.substring("subtopic:".length))
      .filter((subtopic) => subtopic.length > 0);
  };

  // Helper function to get score value for a turn
  const getScoreValue = (turn: ConversationTurn, scoreName: string) => {
    const score = turn.scores.find((s: any) => s.name === scoreName);
    console.log(scoreName, score);
    if (
      score &&
      [
        "Bill:overall-rating",
        "Bill:gears",
        "openai-mod-msg",
        "self-harm-check",
      ].includes(score.name)
    ) {
      return score.stringValue ?? null;
    }

    if (
      score &&
      ["internal-habit-loop", "internal-topic", "internal-action"].includes(
        score.name,
      )
    ) {
      return score.comment ?? null;
    }
    return score ? (score.value ?? score.stringValue) : null;
  };

  // Helper function to get color based on score type and value
  const getScoreColor = (scoreName: string, value: any) => {
    if (value === null || value === undefined)
      return "bg-gray-100 text-gray-400";

    switch (scoreName) {
      case "openai-mod-msg":
      case "self-harm-check":
        // Boolean values: true = red, false = green
        if (value === true || value === "true" || value === "unsafe")
          return "bg-red-100 text-red-700 border-red-200";
        if (value === false || value === "false" || value === "safe")
          return "bg-green-100 text-green-700 border-green-200";
        return "bg-gray-100 text-gray-700 border-gray-200";

      case "Bill:overall-rating":
        // Rating values: good = green, ok = yellow, not good = red
        const rating = String(value).toLowerCase();
        if (rating.includes("good") && !rating.includes("not"))
          return "bg-green-100 text-green-700 border-green-200";
        if (rating.includes("ok") || rating.includes("okay"))
          return "bg-yellow-100 text-yellow-700 border-yellow-200";
        return "bg-red-100 text-red-700 border-red-200";

      default:
        // Default styling for other scores
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  // Helper function to format display value
  const formatDisplayValue = (scoreName: string, value: any) => {
    if (value === null || value === undefined) return "-";

    switch (scoreName) {
      case "openai-mod-msg":
      case "self-harm-check":
        if (value === true || value === "true") return "✗";
        if (value === false || value === "false") return "✓";
        return String(value);

      case "Bill:gears":
        // Convert to ordinal (1st, 2nd, 3rd, etc.)
        const num = parseInt(String(value));
        if (isNaN(num)) return String(value);
        const ordinal =
          num === 1
            ? "1st"
            : num === 2
              ? "2nd"
              : num === 3
                ? "3rd"
                : `${num}th`;
        return ordinal;

      case "last-milestone":
        // Show only integer value
        const milestone = parseInt(String(value));
        return isNaN(milestone) ? String(value) : milestone.toString();

      default:
        return String(value);
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header Row */}
        <div className="mb-2 flex border-b-2 border-gray-200">
          <div className="flex h-16 w-20 items-center justify-center border border-gray-200 bg-gray-50 text-sm font-semibold">
            Turn
          </div>
          {targetScores.map((scoreName) => (
            <div
              key={scoreName}
              className="flex h-16 w-20 items-center justify-center border border-gray-200 bg-gray-50 p-1 text-center text-xs font-semibold"
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      {scoreName.replace(":", ":\n")}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">
                      {SCORE_EXPLANATIONS[scoreName]?.description || scoreName}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
          {/* Subtopic Column Header */}
          <div className="flex h-16 w-24 items-center justify-center border border-gray-200 bg-gray-50 p-1 text-center text-xs font-semibold">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">Subtopic</div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    Topics extracted from subtopic: tags
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Data Rows */}
        <div className="space-y-1">
          {conversationTurns
            .filter((turn) => turn.type === "user")
            .map((turn, index) => (
              <div key={turn.id} className="flex">
                {/* Turn Number */}
                <div className="flex h-16 w-20 items-center justify-center border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700">
                  Turn {index + 1}
                </div>

                {/* Score Cells */}
                {targetScores.map((scoreName) => {
                  const value = getScoreValue(turn, scoreName);
                  const colorClass = getScoreColor(scoreName, value);
                  const displayValue = formatDisplayValue(scoreName, value);

                  return (
                    <div
                      key={scoreName}
                      className={`flex h-16 w-20 items-center justify-center border text-sm font-semibold ${colorClass}`}
                    >
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help text-center">
                              {displayValue}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold">
                                {scoreName}
                              </p>
                              <p className="text-xs">Value: {String(value)}</p>
                              {SCORE_EXPLANATIONS[scoreName] && (
                                <p className="text-xs">
                                  {SCORE_EXPLANATIONS[scoreName].description}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                })}

                {/* Subtopic Cell */}
                <div className="flex h-16 w-24 items-center justify-center border border-purple-200 bg-purple-50 p-1 text-xs font-semibold text-purple-700">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help text-center">
                          {(() => {
                            const subtopics = getSubtopics(turn);
                            if (subtopics.length === 0) return "-";
                            if (subtopics.length === 1) return subtopics[0];
                            return `${subtopics[0]}+${subtopics.length - 1}`;
                          })()}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold">Subtopics</p>
                          {(() => {
                            const subtopics = getSubtopics(turn);
                            if (subtopics.length === 0) {
                              return (
                                <p className="text-xs">No subtopics found</p>
                              );
                            }
                            return (
                              <div className="text-xs">
                                {subtopics.map((subtopic, idx) => (
                                  <p key={idx}>• {subtopic}</p>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

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

        {/* TTFT Metrics Section */}
        <TTFTMetricsDisplay scores={sessionData.data?.scores || []} />

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
          {sessionData.data?.scores && sessionData.data.scores.length > 0 ? (
            <div className="space-y-4">
              {sessionData.data.scores
                .sort((a, b) => {
                  const categoryA =
                    SCORE_EXPLANATIONS[a.name]?.category || "Other";
                  const categoryB =
                    SCORE_EXPLANATIONS[b.name]?.category || "Other";

                  // Sort by category first, then by score name within category
                  if (categoryA === categoryB) {
                    return a.name.localeCompare(b.name);
                  }
                  return categoryA.localeCompare(categoryB);
                })
                .map((score) => (
                  <ScoreDetailCard key={score.id} score={score} />
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No scores found for this session.
            </p>
          )}
        </div>

        {/* Compact Scores Grid */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Turn Scores Overview</h3>
          <div className="mb-4 text-xs text-muted-foreground">
            Compact view of key scores per turn with color coding
          </div>
          <CompactScoresGrid conversationTurns={conversationTurns} />
        </div>

        {/* Conversation Turns Table */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">
            Conversation Turns & Scores
          </h3>
          <div className="mb-4 text-xs text-muted-foreground">
            💡 Hover over score column headers and values for detailed
            explanations
          </div>
          <DataTable
            tableName="conversation-turns"
            columns={createConversationTurnsColumns(
              conversationTurns.map((t) => t.scores),
            )}
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
