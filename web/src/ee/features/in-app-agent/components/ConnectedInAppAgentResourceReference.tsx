import type { ReactNode } from "react";

import {
  InAppAgentResourceReferenceObservation,
  type InAppAgentResourceReferencePresentation,
  InAppAgentResourceReferenceScore,
  InAppAgentResourceReferenceTrace,
} from "@/src/ee/features/in-app-agent/components/InAppAgentResourceReference";
import type { InAppAgentResourceReference } from "@/src/ee/features/in-app-agent/components/utils/resourceReference";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";

export function ConnectedInAppAgentResourceReference({
  label,
  presentation,
  resource,
}: {
  label?: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
  resource: InAppAgentResourceReference;
}) {
  if (resource.type === "trace") {
    return (
      <RuntimeTraceResourceReference
        id={resource.id}
        label={label}
        presentation={presentation}
      />
    );
  }

  if (resource.type === "observation") {
    return (
      <RuntimeObservationResourceReference
        id={resource.id}
        traceId={resource.traceId}
        label={label}
        presentation={presentation}
      />
    );
  }

  return (
    <RuntimeScoreResourceReference
      id={resource.id}
      label={label}
      presentation={presentation}
    />
  );
}

function RuntimeTraceResourceReference({
  id,
  label,
  presentation,
}: {
  id: string;
  label?: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
}) {
  const projectId = useProjectIdFromURL();
  const query = api.traces.byId.useQuery(
    { projectId: projectId ?? "", traceId: id, verbosity: "compact" },
    { enabled: Boolean(projectId && id), retry: false },
  );

  if (!projectId || query.isError || (!query.isLoading && !query.data)) {
    return (
      <InAppAgentResourceReferenceTrace
        id={id}
        label={label}
        presentation={presentation}
        state="unavailable"
      />
    );
  }

  if (query.isLoading) {
    return (
      <InAppAgentResourceReferenceTrace
        id={id}
        label={label}
        presentation={presentation}
        state="loading"
      />
    );
  }

  return (
    <InAppAgentResourceReferenceTrace
      href={buildTraceHref({ projectId, traceId: id })}
      id={id}
      label={label}
      presentation={presentation}
      resource={query.data}
      state="loaded"
    />
  );
}

function RuntimeObservationResourceReference({
  id,
  label,
  presentation,
  traceId,
}: {
  id: string;
  label?: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
  traceId: string;
}) {
  const projectId = useProjectIdFromURL();
  const query = api.observations.byId.useQuery(
    {
      observationId: id,
      projectId: projectId ?? "",
      traceId,
      verbosity: "compact",
    },
    { enabled: Boolean(projectId && id && traceId), retry: false },
  );

  if (!projectId || query.isError || (!query.isLoading && !query.data)) {
    return (
      <InAppAgentResourceReferenceObservation
        id={id}
        label={label}
        presentation={presentation}
        state="unavailable"
      />
    );
  }

  if (query.isLoading) {
    return (
      <InAppAgentResourceReferenceObservation
        id={id}
        label={label}
        presentation={presentation}
        state="loading"
      />
    );
  }

  return (
    <InAppAgentResourceReferenceObservation
      href={buildObservationHref({ projectId, traceId, observationId: id })}
      id={id}
      label={label}
      presentation={presentation}
      resource={query.data}
      state="loaded"
    />
  );
}

function RuntimeScoreResourceReference({
  id,
  label,
  presentation,
}: {
  id: string;
  label?: ReactNode;
  presentation: InAppAgentResourceReferencePresentation;
}) {
  const projectId = useProjectIdFromURL();
  const query = api.scores.byId.useQuery(
    { projectId: projectId ?? "", scoreId: id },
    { enabled: Boolean(projectId && id), retry: false },
  );

  if (!projectId || query.isError || (!query.isLoading && !query.data)) {
    return (
      <InAppAgentResourceReferenceScore
        id={id}
        label={label}
        presentation={presentation}
        state="unavailable"
      />
    );
  }

  if (query.isLoading) {
    return (
      <InAppAgentResourceReferenceScore
        id={id}
        label={label}
        presentation={presentation}
        state="loading"
      />
    );
  }

  const score = query.data;
  return (
    <InAppAgentResourceReferenceScore
      href={buildScoreTargetHref({
        projectId,
        scoreId: id,
        traceId: getStringField(score, "traceId"),
        observationId: getStringField(score, "observationId"),
        sessionId: getStringField(score, "sessionId"),
      })}
      id={id}
      label={label}
      presentation={presentation}
      resource={score}
      state="loaded"
    />
  );
}

const getStringField = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || !(field in value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" && fieldValue.trim()
    ? fieldValue
    : undefined;
};

const buildTraceHref = (params: { projectId: string; traceId: string }) =>
  `/project/${encodeURIComponent(params.projectId)}/traces/${encodeURIComponent(params.traceId)}`;

const buildObservationHref = (params: {
  projectId: string;
  traceId: string;
  observationId: string;
}) =>
  `${buildTraceHref({ projectId: params.projectId, traceId: params.traceId })}?observation=${encodeURIComponent(params.observationId)}`;

const buildSessionHref = (params: { projectId: string; sessionId: string }) =>
  `/project/${encodeURIComponent(params.projectId)}/sessions/${encodeURIComponent(params.sessionId)}`;

const buildScoreTargetHref = (params: {
  projectId: string;
  scoreId: string;
  traceId?: string;
  observationId?: string;
  sessionId?: string;
}) => {
  if (params.traceId && params.observationId) {
    return buildObservationHref({
      projectId: params.projectId,
      traceId: params.traceId,
      observationId: params.observationId,
    });
  }

  if (params.traceId) {
    return buildTraceHref({
      projectId: params.projectId,
      traceId: params.traceId,
    });
  }

  if (params.sessionId) {
    return buildSessionHref({
      projectId: params.projectId,
      sessionId: params.sessionId,
    });
  }

  return `/project/${encodeURIComponent(params.projectId)}/scores?scoreId=${encodeURIComponent(params.scoreId)}`;
};
