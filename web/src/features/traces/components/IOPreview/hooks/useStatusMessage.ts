import { useMemo } from "react";
import {
  getStatusMessagePresentation,
  parseStructuredStatusMessage,
  type ObservationStatusMessage,
} from "../components/statusMessagePresentation";

export function useStatusMessage(status: ObservationStatusMessage | undefined) {
  const statusPresentation = status
    ? getStatusMessagePresentation(status.level)
    : undefined;
  const message = status?.message;
  const parsedStatusMessage = useMemo(() => {
    if (message === undefined) return undefined;
    return parseStructuredStatusMessage(message);
  }, [message]);

  return { statusPresentation, parsedStatusMessage };
}
