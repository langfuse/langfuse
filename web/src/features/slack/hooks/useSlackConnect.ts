import { useEffect, useRef, useState } from "react";

import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

/** useSlackConnect runs the Slack OAuth popup flow for a project and tracks whether it is pending or failed; it reports the outcome in a toast unless `shouldToast` is false. */
export function useSlackConnect({
  projectId,
  onSuccess,
  onError,
  shouldToast = true,
}: {
  projectId: string;
  shouldToast?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>();
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  );

  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
      }
    };
  }, []);

  const connect = async () => {
    if (!integrationStatus?.installUrl) {
      const errorMessage = "Install URL not available. Please try again.";
      setConnectError(errorMessage);
      onError?.(new Error(errorMessage));
      if (shouldToast)
        showErrorToast("Connection Failed", errorMessage, {
          operation: "slack.connect",
          errorOrigin: "backend",
          errorCategory: "product_state",
        });
      return;
    }

    setIsConnecting(true);
    setConnectError(undefined);

    try {
      const popup = window.open(
        integrationStatus.installUrl,
        "slack-oauth",
        "width=600,height=700,scrollbars=yes,resizable=yes",
      );

      if (!popup) {
        throw new Error("Popup blocked. Please allow popups and try again.");
      }

      popupRef.current = popup;

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === "slack-oauth-success") {
          popup.close();
          setIsConnecting(false);

          if (shouldToast)
            showSuccessToast({
              operation: "slack.connect",
              title: "Slack Connected",
              description: `Successfully connected to ${event.data.teamName}.`,
            });

          onSuccess?.();

          window.removeEventListener("message", handleMessage);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          popupRef.current = null;
          messageHandlerRef.current = null;
        } else if (event.data.type === "slack-oauth-error") {
          popup.close();
          setIsConnecting(false);

          if (shouldToast)
            showErrorToast("Connection Failed", event.data.error, {
              operation: "slack.connect",
              errorOrigin: "backend",
              errorCategory: "internal",
            });
          setConnectError(event.data.error);
          onError?.(new Error(event.data.error));

          window.removeEventListener("message", handleMessage);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          popupRef.current = null;
          messageHandlerRef.current = null;
        }
      };

      messageHandlerRef.current = handleMessage;
      window.addEventListener("message", handleMessage);

      // The user can close the popup without finishing OAuth.
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          setIsConnecting(false);
          window.removeEventListener("message", handleMessage);
          clearInterval(checkClosed);
          popupRef.current = null;
          messageHandlerRef.current = null;
          intervalRef.current = null;
        }
      }, 1000);

      intervalRef.current = checkClosed;
    } catch (error) {
      setIsConnecting(false);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to connect to Slack";
      setConnectError(errorMessage);
      onError?.(new Error(errorMessage));
      if (shouldToast)
        showErrorToast("Connection Failed", errorMessage, {
          operation: "slack.connect",
          errorOrigin: "frontend",
          errorCategory: "product_state",
        });
    }
  };

  return {
    connect,
    connectError,
    isConnecting,
    canConnect: Boolean(integrationStatus?.installUrl),
  };
}
