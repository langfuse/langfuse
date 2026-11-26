import Link from "next/link";
import type { NotebookBlock } from "@/src/features/notebooks/schema";

type EmbedKind = Extract<
  NotebookBlock,
  { schema: "embed@1" }
>["props"]["target"]["kind"];

const labels = { trace: "Trace", session: "Session" } satisfies Record<
  EmbedKind,
  string
>;

export function NotebookEmbed({
  projectId,
  kind,
  state,
}: {
  projectId: string;
  kind: EmbedKind;
  state:
    | { status: "empty"; variableName: string | undefined }
    | { status: "loading" }
    | { status: "unavailable" }
    | {
        status: "ready";
        resourceId: string;
        title: string;
        traceCount?: number;
      };
}) {
  const label = labels[kind];
  return (
    <div className="min-w-0 rounded-md border p-4 text-sm">
      <strong>{label}</strong>
      {state.status === "empty" && (
        <p>
          {state.variableName
            ? `Set ${state.variableName} to view this ${kind}.`
            : `No ${kind} ID configured.`}
        </p>
      )}
      {state.status === "loading" && <p role="status">Loading {kind}…</p>}
      {state.status === "unavailable" && <p>{label} unavailable.</p>}
      {state.status === "ready" && (
        <>
          <p className="wrap-break-word">{state.title}</p>
          {state.traceCount !== undefined && (
            <p>
              {state.traceCount} {state.traceCount === 1 ? "trace" : "traces"}
            </p>
          )}
          <Link
            className="underline"
            href={`/project/${encodeURIComponent(projectId)}/${kind}s/${encodeURIComponent(state.resourceId)}`}
          >
            Open {kind}
          </Link>
        </>
      )}
    </div>
  );
}
