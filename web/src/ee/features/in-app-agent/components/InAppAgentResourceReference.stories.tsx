import preview from "../../../../../.storybook/preview";
import type { ReactNode } from "react";
import {
  InAppAgentResourceReferenceObservation,
  InAppAgentResourceReferenceScore,
  InAppAgentResourceReferenceTrace,
} from "./InAppAgentResourceReference";

const meta = preview.meta({
  component: InAppAgentResourceReferenceTrace,
});

const traceResource = {
  environment: "production",
  name: "checkout-agent",
  observations: [{ id: "obs-router" }, { id: "obs-generation" }],
  sessionId: "session-42",
  timestamp: "2026-06-16T14:00:00.000Z",
  userId: "user-42",
};

const generationResource = {
  model: "gpt-4.1",
  name: "OpenAI generation",
  startTime: "2026-06-16T14:00:00.000Z",
  type: "GENERATION",
};

const scoreResource = {
  dataType: "NUMERIC",
  name: "quality",
  source: "API",
  timestamp: "2026-06-16T14:00:00.000Z",
  value: 0.92,
};

const observationTypes = [
  "GENERATION",
  "SPAN",
  "EVENT",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "GUARDRAIL",
  "UNKNOWN",
] as const;

const scoreDataTypes = [
  "NUMERIC",
  "CATEGORICAL",
  "BOOLEAN",
  "CORRECTION",
  "TEXT",
] as const;

export const InlineLoadedTrace = meta.story({
  args: {
    href: "/project/project-demo/traces/trace-demo",
    id: "trace-demo",
    presentation: "inline",
    resource: traceResource,
    state: "loaded",
  },
});

export const RowLoadedTrace = meta.story({
  render: () => (
    <ResourceReferenceStoryFrame>
      <InAppAgentResourceReferenceTrace
        href="/project/project-demo/traces/trace-demo"
        id="trace-demo"
        presentation="row"
        resource={traceResource}
        state="loaded"
      />
    </ResourceReferenceStoryFrame>
  ),
});

export const InlineLoadedObservation = meta.story({
  render: () => (
    <InAppAgentResourceReferenceObservation
      href="/project/project-demo/traces/trace-demo?observation=obs-demo"
      id="obs-demo"
      presentation="inline"
      resource={generationResource}
      state="loaded"
    />
  ),
});

export const RowLoadedObservation = meta.story({
  render: () => (
    <ResourceReferenceStoryFrame>
      <InAppAgentResourceReferenceObservation
        href="/project/project-demo/traces/trace-demo?observation=obs-demo"
        id="obs-demo"
        presentation="row"
        resource={generationResource}
        state="loaded"
      />
    </ResourceReferenceStoryFrame>
  ),
});

export const InlineLoadedScore = meta.story({
  render: () => (
    <InAppAgentResourceReferenceScore
      href="/project/project-demo/scores?scoreId=score-demo"
      id="score-demo"
      presentation="inline"
      resource={scoreResource}
      state="loaded"
    />
  ),
});

export const RowLoadedScore = meta.story({
  render: () => (
    <ResourceReferenceStoryFrame>
      <InAppAgentResourceReferenceScore
        href="/project/project-demo/scores?scoreId=score-demo"
        id="score-demo"
        presentation="row"
        resource={scoreResource}
        state="loaded"
      />
    </ResourceReferenceStoryFrame>
  ),
});

function ResourceReferenceStoryFrame({ children }: { children: ReactNode }) {
  return (
    <div className="border-border bg-background max-w-xl overflow-hidden rounded-lg border">
      {children}
    </div>
  );
}

export const RowLoadedTraces = meta.story({
  render: () => (
    <div className="border-border bg-background max-w-xl overflow-hidden rounded-lg border">
      <InAppAgentResourceReferenceTrace
        href="/project/project-demo/traces/trace-demo"
        id="trace-demo"
        presentation="row"
        resource={traceResource}
        state="loaded"
      />
      <InAppAgentResourceReferenceTrace
        href="/project/project-demo/traces/trace-demo-2"
        id="trace-demo-2"
        presentation="row"
        resource={{
          ...traceResource,
          environment: "staging",
          name: "refund-agent",
          sessionId: "session-43",
          userId: "user-43",
        }}
        state="loaded"
      />
      <InAppAgentResourceReferenceTrace
        href="/project/project-demo/traces/trace-demo-3"
        id="trace-demo-3"
        presentation="row"
        resource={{
          ...traceResource,
          environment: "production",
          name: "support-agent",
          sessionId: "session-44",
          userId: "user-44",
        }}
        state="loaded"
      />
    </div>
  ),
});

export const RowLoadedObservations = meta.story({
  render: () => (
    <div className="border-border bg-background max-w-xl overflow-hidden rounded-lg border">
      {observationTypes.slice(0, 3).map((type) => (
        <InAppAgentResourceReferenceObservation
          href={`/project/project-demo/traces/trace-demo?observation=obs-${type.toLowerCase()}`}
          id={`obs-${type.toLowerCase()}`}
          key={type}
          presentation="row"
          resource={{
            model: type === "GENERATION" ? "gpt-4.1" : undefined,
            name: `${type.toLowerCase()} observation`,
            startTime: "2026-06-16T14:00:00.000Z",
            type,
          }}
          state="loaded"
        />
      ))}
    </div>
  ),
});

export const RowLoadedScores = meta.story({
  render: () => (
    <div className="border-border bg-background max-w-xl overflow-hidden rounded-lg border">
      {scoreDataTypes.slice(0, 3).map((dataType) => (
        <InAppAgentResourceReferenceScore
          href={`/project/project-demo/scores?scoreId=score-${dataType.toLowerCase()}`}
          id={`score-${dataType.toLowerCase()}`}
          key={dataType}
          presentation="row"
          resource={{
            dataType,
            name: `${dataType.toLowerCase()} score`,
            source: "EVAL",
            stringValue: dataType === "NUMERIC" ? undefined : "accepted",
            timestamp: "2026-06-16T14:00:00.000Z",
            value: dataType === "NUMERIC" ? 0.92 : undefined,
          }}
          state="loaded"
        />
      ))}
    </div>
  ),
});

export const LoadingStates = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-3 p-4">
      <p className="text-sm leading-7">
        Investigate{" "}
        <InAppAgentResourceReferenceTrace
          id="trace-loading"
          label="trace trace-loading"
          presentation="inline"
          state="loading"
        />{" "}
        and{" "}
        <InAppAgentResourceReferenceObservation
          id="obs-loading"
          label="observation obs-loading"
          presentation="inline"
          state="loading"
        />{" "}
        before escalating{" "}
        <InAppAgentResourceReferenceScore
          id="score-loading"
          label="score score-loading"
          presentation="inline"
          state="loading"
        />
        .
      </p>
      <InAppAgentResourceReferenceTrace
        id="trace-loading"
        presentation="row"
        state="loading"
      />
      <InAppAgentResourceReferenceObservation
        id="obs-loading"
        presentation="row"
        state="loading"
      />
      <InAppAgentResourceReferenceScore
        id="score-loading"
        presentation="row"
        state="loading"
      />
      <div className="border-border bg-background overflow-hidden rounded-lg border">
        <InAppAgentResourceReferenceTrace
          id="trace-loading-1"
          presentation="row"
          state="loading"
        />
        <InAppAgentResourceReferenceTrace
          id="trace-loading-2"
          presentation="row"
          state="loading"
        />
        <InAppAgentResourceReferenceTrace
          id="trace-loading-3"
          presentation="row"
          state="loading"
        />
      </div>
    </div>
  ),
});

export const UnavailableStates = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-3 p-4">
      <p className="text-sm leading-7">
        Deleted references stay readable inline:{" "}
        <InAppAgentResourceReferenceTrace
          id="deleted-trace"
          label="trace deleted-trace"
          presentation="inline"
          state="unavailable"
        />{" "}
        <InAppAgentResourceReferenceObservation
          id="deleted-observation"
          label="observation deleted-observation"
          presentation="inline"
          state="unavailable"
        />{" "}
        <InAppAgentResourceReferenceScore
          id="deleted-score"
          label="score deleted-score"
          presentation="inline"
          state="unavailable"
        />
      </p>
      <InAppAgentResourceReferenceTrace
        id="deleted-trace"
        label="trace deleted-trace"
        presentation="row"
        state="unavailable"
      />
      <InAppAgentResourceReferenceObservation
        id="deleted-observation"
        label="observation deleted-observation"
        presentation="row"
        state="unavailable"
      />
      <InAppAgentResourceReferenceScore
        id="deleted-score"
        label="score deleted-score"
        presentation="row"
        state="unavailable"
      />
      <div className="border-border bg-background overflow-hidden rounded-lg border">
        <InAppAgentResourceReferenceTrace
          id="deleted-trace-1"
          label="trace deleted-trace-1"
          presentation="row"
          state="unavailable"
        />
        <InAppAgentResourceReferenceTrace
          id="deleted-trace-2"
          label="trace deleted-trace-2"
          presentation="row"
          state="unavailable"
        />
        <InAppAgentResourceReferenceTrace
          id="deleted-trace-3"
          label="trace deleted-trace-3"
          presentation="row"
          state="unavailable"
        />
      </div>
    </div>
  ),
});

export const ObservationIcons = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-3 p-4">
      {observationTypes.map((type) => (
        <InAppAgentResourceReferenceObservation
          href={`/project/project-demo/traces/trace-demo?observation=obs-${type.toLowerCase()}`}
          id={`obs-${type.toLowerCase()}`}
          key={type}
          presentation="row"
          resource={{
            internalModel: type === "GENERATION" ? undefined : "internal-model",
            name: `${type.toLowerCase()} observation`,
            startTime: "2026-06-16T14:00:00.000Z",
            type,
          }}
          state="loaded"
        />
      ))}
    </div>
  ),
});

export const ScoreDataTypes = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-3 p-4">
      {scoreDataTypes.map((dataType) => (
        <InAppAgentResourceReferenceScore
          href={`/project/project-demo/scores?scoreId=score-${dataType.toLowerCase()}`}
          id={`score-${dataType.toLowerCase()}`}
          key={dataType}
          presentation="row"
          resource={{
            dataType,
            name: `${dataType.toLowerCase()} score`,
            source: "EVAL",
            stringValue: dataType === "NUMERIC" ? undefined : "accepted",
            timestamp: "2026-06-16T14:00:00.000Z",
            value: dataType === "NUMERIC" ? 0.92 : undefined,
          }}
          state="loaded"
        />
      ))}
    </div>
  ),
});

export const FallbacksAndUnlinkedRows = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col gap-3 p-4">
      <InAppAgentResourceReferenceTrace
        id="trace-without-name"
        label="trace label fallback"
        presentation="row"
        resource={{ timestamp: "2026-06-16T14:00:00.000Z" }}
        state="loaded"
      />
      <InAppAgentResourceReferenceObservation
        id="obs-without-name"
        presentation="row"
        resource={{ type: "SPAN" }}
        state="loaded"
      />
      <InAppAgentResourceReferenceScore
        id="score-without-valid-type"
        presentation="row"
        resource={{
          dataType: "UNKNOWN",
          source: "API",
          value: 1,
        }}
        state="loaded"
      />
    </div>
  ),
});
