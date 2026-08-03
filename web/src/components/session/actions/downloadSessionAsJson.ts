import { type RouterOutputs } from "@/src/utils/api";

type SessionData = RouterOutputs["sessions"]["byIdWithScores"];
type SessionTrace = NonNullable<SessionData>["traces"][number];
type SessionComments = RouterOutputs["comments"]["getByObjectId"];
type TraceCommentsByTraceId =
  RouterOutputs["comments"]["getTraceCommentsBySessionId"];

type RefetchSessionComments = () => Promise<{
  data?: SessionComments;
}>;

type FetchTraceComments = (input: {
  projectId: string;
  sessionId: string;
}) => Promise<TraceCommentsByTraceId>;

type CaptureSessionEvent = (
  eventName: "session_detail:download_button_click",
) => void;

export function buildSessionExportData({
  session,
  sessionComments,
  traceCommentsByTraceId,
}: {
  session: SessionData | undefined;
  sessionComments: SessionComments | undefined;
  traceCommentsByTraceId: TraceCommentsByTraceId;
}) {
  if (!session) {
    return {
      comments: sessionComments ?? [],
    };
  }

  return {
    ...session,
    traces: session.traces.map((trace: SessionTrace) => ({
      ...trace,
      comments: traceCommentsByTraceId[trace.id] ?? [],
    })),
    comments: sessionComments ?? [],
  };
}

export function downloadJsonFile({
  data,
  fileName,
}: {
  data: unknown;
  fileName: string;
}) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], {
    type: "application/json; charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadSessionAsJson({
  capture,
  fetchTraceComments,
  projectId,
  refetchSessionComments,
  session,
  sessionId,
}: {
  capture: CaptureSessionEvent;
  fetchTraceComments: FetchTraceComments;
  projectId: string;
  refetchSessionComments: RefetchSessionComments;
  session: SessionData | undefined;
  sessionId: string;
}) {
  const [sessionCommentsData, traceCommentsByTraceId] = await Promise.all([
    refetchSessionComments(),
    fetchTraceComments({
      projectId,
      sessionId,
    }),
  ]);

  downloadJsonFile({
    data: buildSessionExportData({
      session,
      sessionComments: sessionCommentsData.data,
      traceCommentsByTraceId,
    }),
    fileName: `session-${sessionId}.json`,
  });

  capture("session_detail:download_button_click");
}
