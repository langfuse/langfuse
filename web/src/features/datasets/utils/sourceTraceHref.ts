export const getSourceTraceHref = ({
  projectId,
  sourceTraceId,
  sourceObservationId,
}: {
  projectId: string;
  sourceTraceId: string;
  sourceObservationId?: string | null;
}) => {
  const traceHref = `/project/${projectId}/traces/${encodeURIComponent(sourceTraceId)}`;

  return sourceObservationId
    ? `${traceHref}?observation=${encodeURIComponent(sourceObservationId)}`
    : traceHref;
};
