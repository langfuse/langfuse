import React, { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { Slack } from "lucide-react";
import { useRouter } from "next/router";
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
  const router = useRouter();

  // Get OAuth URL
  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Handle OAuth callback results from URL params
  useEffect(() => {
    if (router.query.success === "true") {
      const teamName = router.query.team_name as string;

      showSuccessToast({
        title: "Slack Connected",
        description: `Successfully connected to ${teamName || "your Slack workspace"}.`,
      });

      // Clean up URL parameters
      router.replace(`/project/${projectId}/settings/slack`, undefined, {
        shallow: true,
      });

      onSuccess?.();
    } else if (router.query.error) {
      const errorMessage = router.query.error as string;

      showErrorToast("Connection Failed", errorMessage);

      // Clean up URL parameters
      router.replace(`/project/${projectId}/settings/slack`, undefined, {
        shallow: true,
      });

      onError?.(new Error(errorMessage));
    }
  }, [router.query, projectId, onSuccess, onError, router]);

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
      // Navigate to install URL which will handle OAuth with proper session management
      // The SlackService will handle the OAuth flow and redirect back
      window.location.href = integrationStatus.installUrl;
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
