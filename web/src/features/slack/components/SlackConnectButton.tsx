import React from "react";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { SiSlack } from "@langfuse/icons/si";
import { useSlackConnect } from "@/src/features/slack/hooks/useSlackConnect";

/**
 * Props for the SlackConnectButton component
 */
interface SlackConnectButtonProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Button variant */
  variant?: ButtonProps["variant"];
  /** Button size */
  size?: ButtonProps["size"];
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
  const { connect, isConnecting, canConnect } = useSlackConnect({
    projectId,
    onSuccess,
    onError,
  });

  return (
    <Button
      onClick={connect}
      disabled={disabled || isConnecting || !canConnect}
      variant={variant}
      size={size}
      className="flex items-center gap-2"
    >
      <SiSlack size="base" />
      {showText && <span>{isConnecting ? "Connecting..." : buttonText}</span>}
    </Button>
  );
};
