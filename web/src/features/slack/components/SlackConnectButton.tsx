import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import { Slack } from "lucide-react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

/**
 * Props for the SlackConnectButton component
 */
interface SlackConnectButtonProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Button variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Button size */
  size?: "default" | "sm" | "lg";
  /** Custom button text */
  buttonText?: string;
  /** Callback when connection is successful */
  onSuccess?: () => void;
  /** Callback when connection fails */
  onError?: (error: Error) => void;
  /** Whether to show the button text */
  showText?: boolean;
}

/**
 * Simplified Slack Connect Button
 *
 * Uses direct navigation to OAuth URL instead of complex popup handling.
 * The SlackService handles the OAuth flow and redirects back to the correct page.
 */
export const SlackConnectButton: React.FC<SlackConnectButtonProps> = ({
  projectId,
  disabled = false,
  variant = "default",
  size = "default",
  buttonText = "Connect Slack",
  onSuccess,
  onError,
  showText = true,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  );

  // Get integration status
  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Clean up popup if it's still open
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }

      // Clean up interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Clean up event listener
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
      }
    };
  }, []);

  // Handle connect button click
  const handleConnect = async () => {
    if (!integrationStatus?.installUrl) {
      const errorMessage = "Install URL not available. Please try again.";
      onError?.(new Error(errorMessage));
      showErrorToast("Connection Failed", errorMessage);
      return;
    }

    setIsConnecting(true);

    try {
      // Open OAuth flow in popup window
      const popup = window.open(
        integrationStatus.installUrl,
        "slack-oauth",
        "width=600,height=700,scrollbars=yes,resizable=yes",
      );

      if (!popup) {
        throw new Error("Popup blocked. Please allow popups and try again.");
      }

      // Store popup reference
      popupRef.current = popup;

      // Listen for messages from popup
      const handleMessage = (event: MessageEvent) => {
        // Verify origin for security
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === "slack-oauth-success") {
          popup.close();
          setIsConnecting(false);

          showSuccessToast({
            title: "Slack Connected",
            description: `Successfully connected to ${event.data.teamName}.`,
          });

          onSuccess?.();

          // Clean up event listener and interval
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

          showErrorToast("Connection Failed", event.data.error);
          onError?.(new Error(event.data.error));

          // Clean up event listener and interval
          window.removeEventListener("message", handleMessage);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          popupRef.current = null;
          messageHandlerRef.current = null;
        }
      };

      // Store message handler reference
      messageHandlerRef.current = handleMessage;

      // Add message listener
      window.addEventListener("message", handleMessage);

      // Also listen for popup being closed manually
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

      // Store interval reference
      intervalRef.current = checkClosed;
    } catch (error) {
      setIsConnecting(false);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to connect to Slack";
      onError?.(new Error(errorMessage));
      showErrorToast("Connection Failed", errorMessage);
    }
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={disabled || isConnecting || !integrationStatus?.installUrl}
      variant={variant}
      size={size}
      className="flex items-center gap-2"
    >
      <Slack className="h-4 w-4" />
      {showText && <span>{isConnecting ? "Connecting..." : buttonText}</span>}
    </Button>
  );
};
