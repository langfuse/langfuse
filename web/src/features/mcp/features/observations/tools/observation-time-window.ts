import { InvalidRequestError } from "@langfuse/shared";

const MAX_OBSERVATION_MCP_TIME_WINDOW_DAYS = 30;
const MAX_OBSERVATION_MCP_TIME_WINDOW_MS =
  MAX_OBSERVATION_MCP_TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const assertObservationMcpTimeWindow = ({
  fromStartTime,
  toStartTime,
}: {
  fromStartTime?: string;
  toStartTime?: string;
}) => {
  if (!fromStartTime) return;

  const startTime = new Date(fromStartTime).getTime();
  const endTime = toStartTime ? new Date(toStartTime).getTime() : Date.now();

  if (
    endTime > startTime &&
    endTime - startTime > MAX_OBSERVATION_MCP_TIME_WINDOW_MS
  ) {
    throw new InvalidRequestError(
      `The maximum supported observation time window is ${MAX_OBSERVATION_MCP_TIME_WINDOW_DAYS} days. Narrow fromStartTime and toStartTime and paginate within that window.`,
    );
  }
};
