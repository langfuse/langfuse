import Link from "next/link";
import { Clock, ListTree } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
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
  embedded = false,
}: {
  projectId: string;
  kind: EmbedKind;
  embedded?: boolean;
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
  const Icon = kind === "trace" ? ListTree : Clock;
  return (
    <div
      className={cn(
        "bg-muted/30 flex min-w-0 flex-col items-center justify-center gap-2 p-6 text-center text-sm",
        embedded ? "h-full" : "min-h-32 rounded-md border",
      )}
    >
      <span className="bg-background text-muted-foreground grid size-10 place-items-center rounded-lg border">
        <Icon size="base" aria-hidden="true" />
      </span>
      <strong>
        {state.status === "empty"
          ? state.variableName
            ? `No ${kind} selected`
            : `${label} preview`
          : label}
      </strong>
      {state.status === "empty" && (
        <p className="text-muted-foreground max-w-xs wrap-break-word">
          {state.variableName
            ? `Set ${state.variableName} to view this ${kind}.`
            : `No ${kind} ID configured.`}
        </p>
      )}
      {state.status === "loading" && (
        <p role="status" className="text-muted-foreground">
          Loading {kind}…
        </p>
      )}
      {state.status === "unavailable" && (
        <p className="text-muted-foreground">{label} unavailable.</p>
      )}
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
