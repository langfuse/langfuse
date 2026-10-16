import { buildSessionPath, buildTracePath } from "@langfuse/shared";
import { useRouter } from "next/router";
import { TablePeekView } from "@/src/components/table/peek";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ModernSessionHeader } from "@/src/features/sessions/ModernSessionHeader";
import { SessionMetadataJsonPathControl } from "@/src/features/sessions/SessionMetadataJsonPathControl";
import { ConnectedModernSessionBodyTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline";
import { api } from "@/src/utils/api";
import { AgentIdentity } from "../appearance";
import { useAgentsPrototypeOptions } from "../prototype-options";

export function AgentSessionPeek({
  projectId,
  sessionId,
  agentName,
  closePeek,
  participants,
  traceAgents,
}: {
  projectId: string;
  sessionId: string;
  agentName: string;
  closePeek: () => void;
  participants: string[];
  traceAgents: ReadonlyMap<string, string[]>;
}) {
  return (
    <TablePeekView
      itemType="SESSION"
      title={sessionId}
      closePeek={closePeek}
      tableName="Agent sessions"
      isV4
      actions={
        <Button
          text="Full session"
          variant="secondary"
          href={buildSessionPath({ projectId, sessionId })}
        />
      }
    >
      <AgentSessionContent
        key={sessionId}
        projectId={projectId}
        sessionId={sessionId}
        agentName={agentName}
        participants={participants}
        traceAgents={traceAgents}
      />
    </TablePeekView>
  );
}

function AgentSessionContent({
  projectId,
  sessionId,
  agentName,
  participants,
  traceAgents,
}: {
  projectId: string;
  sessionId: string;
  agentName: string;
  participants: string[];
  traceAgents: ReadonlyMap<string, string[]>;
}) {
  const router = useRouter();
  const { options } = useAgentsPrototypeOptions(projectId);
  const input = { projectId, sessionId };
  const session = api.sessions.byIdWithScoresFromEvents.useQuery(input);
  const traces = api.sessions.tracesFromEvents.useQuery(input);
  if (session.isError || traces.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <Alert.Title>Session could not be loaded</Alert.Title>
          <Alert.Description>
            The session may be unavailable or still processing.
            <Button
              text="Retry"
              variant="secondary"
              onClick={() => {
                session.refetch();
                traces.refetch();
              }}
            />
          </Alert.Description>
        </Alert>
      </div>
    );
  }
  if (!session.data) {
    return <Skeleton className="m-4 h-40" />;
  }
  const value = session.data;
  const tracesState = traces.data
    ? ({ type: "loaded", traces: traces.data } as const)
    : ({ type: "loading" } as const);
  return (
    <div className="ph-no-capture flex min-h-[32rem] flex-col">
      <div className="bg-muted/30 border-b px-4 py-3 text-sm">
        Session context opened from{" "}
        <span className="font-bold">{agentName}</span>. This peek shows the
        whole session, including activity outside the selected interval and
        other agents. Totals below belong to the session.
      </div>
      {options.showIdentityBadges && (
        <div className="flex flex-col gap-3 border-b p-4">
          <div>
            <p className="text-muted-foreground mb-2 text-xs">
              Observed session participants · identity preview
            </p>
            <AgentParticipantBadges
              projectId={projectId}
              names={participants}
            />
          </div>
          {traces.data?.slice(0, 5).map((trace) => (
            <div
              key={trace.id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <a
                href={buildTracePath({
                  projectId,
                  traceId: trace.id,
                  timestamp: trace.timestamp,
                })}
                className="text-primary max-w-64 truncate text-xs underline-offset-2 hover:underline"
                title={trace.id}
              >
                {trace.id}
              </a>
              <AgentParticipantBadges
                projectId={projectId}
                names={traceAgents.get(trace.id) ?? []}
              />
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Badges use sampled observation attribution. An absent badge means no
            identity evidence in the loaded sample.
          </p>
        </div>
      )}
      <SessionMetadataJsonPathControl
        projectId={projectId}
        sessionId={sessionId}
        traces={
          traces.data
            ? { state: "loaded", data: traces.data }
            : { state: "loading" }
        }
        filterState={[]}
      >
        {(metadataJsonPaths) => (
          <ModernSessionHeader
            dividerTone="default"
            projectId={projectId}
            countTraces={value.countTraces}
            minTimestamp={value.minTimestamp}
            maxTimestamp={value.maxTimestamp}
            tokensIn={value.inputUsage}
            tokensOut={value.outputUsage}
            totalTokens={value.totalTokens}
            totalCost={value.totalCost ?? 0}
            users={value.users}
            scores={value.scores}
            metadataJsonPaths={metadataJsonPaths}
          />
        )}
      </SessionMetadataJsonPathControl>
      <ConnectedModernSessionBodyTimeline
        projectId={projectId}
        sessionId={sessionId}
        tracesState={tracesState}
        openPeek={(_, trace) => {
          router.push(
            buildTracePath({
              projectId,
              traceId: trace.id,
              timestamp: trace.timestamp,
            }),
          );
        }}
      />
    </div>
  );
}

function AgentParticipantBadges({
  projectId,
  names,
}: {
  projectId: string;
  names: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {names.slice(0, 3).map((name) => (
        <span
          key={name}
          className="max-w-40 rounded-md border px-2 py-1 text-xs"
        >
          <AgentIdentity projectId={projectId} agentName={name} size="sm" />
        </span>
      ))}
      {names.length > 3 && (
        <span
          className="text-muted-foreground text-xs"
          title={names.slice(3).join(", ")}
        >
          +{names.length - 3}
        </span>
      )}
      {names.length === 0 && (
        <span className="text-muted-foreground text-xs">
          No attributed identity in sample
        </span>
      )}
    </div>
  );
}
