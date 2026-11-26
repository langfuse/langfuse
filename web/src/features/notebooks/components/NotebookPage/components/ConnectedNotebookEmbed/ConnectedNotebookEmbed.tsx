import type { ComponentProps } from "react";
import { buildTracePath } from "@langfuse/shared";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { DetailPageListsProvider } from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import { SessionPage } from "@/src/features/sessions/SessionPages";
import { ConnectedSessionScopeActions } from "@/src/features/traces/components/ConnectedSessionScopeActions/ConnectedSessionScopeActions";
import { Trace } from "@/src/features/traces/components/Trace";
import { TraceDetailActions } from "@/src/features/traces/components/TraceDetailActions";
import { TraceDetailBody } from "@/src/features/traces/components/TraceDetailBody";
import { useTraceDetailData } from "@/src/features/traces/hooks/useTraceDetailData";
import { NotebookEmbed } from "../NotebookEmbed/NotebookEmbed";
import { NotebookEmbedNavigation } from "../NotebookEmbed/NotebookEmbedNavigation";
import { NotebookEmbedWorkspace } from "../NotebookEmbed/NotebookEmbedWorkspace";

type ResourceProps = {
  projectId: string;
  resourceId: string;
  sidebar?: "expanded" | "collapsed";
};
type EmbedProps = ComponentProps<typeof NotebookEmbed>;

function ConnectedTraceWorkspace({
  projectId,
  resourceId,
  sidebar,
}: ResourceProps) {
  const trace = useTraceDetailData({ projectId, traceId: resourceId });
  if (!trace.isLoading && (trace.isError || !trace.data)) {
    return (
      <NotebookEmbed
        embedded
        projectId={projectId}
        kind="trace"
        state={{ status: "unavailable" }}
      />
    );
  }

  return (
    <TraceDetailActions
      trace={trace.data}
      traceContext="peek"
      shareUrl={buildTracePath({ projectId, traceId: resourceId })}
    >
      {(actions) => (
        <TraceDetailBody
          trace={trace.data}
          context="peek"
          layout={sidebar === "collapsed" ? "observation-focused" : undefined}
          truncatedAtObservations={trace.truncatedAtObservations}
          header={{
            variant: "page",
            headerProps: { itemType: "TRACE", title: resourceId, actions },
          }}
        />
      )}
    </TraceDetailActions>
  );
}

function ConnectedSessionWorkspace({ projectId, resourceId }: ResourceProps) {
  const { isV4, isResolved } = useReadPath();
  if (!isResolved) {
    return (
      <NotebookEmbed
        embedded
        projectId={projectId}
        kind="session"
        state={{ status: "loading" }}
      />
    );
  }
  if (!isV4)
    return (
      <SessionPage projectId={projectId} sessionId={resourceId} embedded />
    );

  return (
    <ConnectedSessionScopeActions projectId={projectId} sessionId={resourceId}>
      {(actions) => (
        <Trace.Session
          projectId={projectId}
          sessionId={resourceId}
          context="peek"
          header={{
            variant: "page",
            headerProps: { itemType: "SESSION", title: resourceId, actions },
          }}
        />
      )}
    </ConnectedSessionScopeActions>
  );
}

const workspaces = {
  trace: ConnectedTraceWorkspace,
  session: ConnectedSessionWorkspace,
} satisfies Record<EmbedProps["kind"], typeof ConnectedTraceWorkspace>;

export function ConnectedNotebookEmbed({
  projectId,
  kind,
  resourceId,
  variableName,
  sidebar,
}: Pick<EmbedProps, "projectId" | "kind"> & {
  resourceId: string | undefined;
  variableName: string | undefined;
  sidebar?: ResourceProps["sidebar"];
}) {
  const Workspace = workspaces[kind];
  return (
    <NotebookEmbedWorkspace kind={kind}>
      {resourceId?.trim() ? (
        <NotebookEmbedNavigation key={`${projectId}:${kind}:${resourceId}`}>
          <DetailPageListsProvider>
            <Workspace
              projectId={projectId}
              resourceId={resourceId}
              sidebar={sidebar}
            />
          </DetailPageListsProvider>
        </NotebookEmbedNavigation>
      ) : (
        <NotebookEmbed
          embedded
          projectId={projectId}
          kind={kind}
          state={{ status: "empty", variableName }}
        />
      )}
    </NotebookEmbedWorkspace>
  );
}
