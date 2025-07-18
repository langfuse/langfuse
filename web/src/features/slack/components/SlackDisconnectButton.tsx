import React, { useState } from "react";
import { Unlink, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";

/**
 * Props for the SlackDisconnectButton component
 */
interface SlackDisconnectButtonProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button variant */
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "destructive"
    | "ghost"
    | "link";
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Custom button text */
  buttonText?: string;
  /** Callback when disconnection is successful */
  onSuccess?: () => void;
  /** Callback when disconnection fails */
  onError?: (error: Error) => void;
  /** Whether to show confirmation dialog */
  showConfirmation?: boolean;
  /** Whether to show the button text */
  showText?: boolean;
}

/**
 * A button component that handles disconnecting the Slack integration.
 *
 * This component handles:
 * - Showing a confirmation dialog before disconnecting
 * - Calling the disconnect API endpoint
 * - Providing loading states during the disconnection process
 * - Displaying appropriate success/error messages
 * - Calling success/error callbacks
 *
 * The component includes safety measures to prevent accidental disconnection:
 * - Confirmation dialog with clear warning about consequences
 * - Information about what happens when disconnecting
 * - Option to cancel the operation
 *
 * @param projectId - The project ID for the Slack integration
 * @param disabled - Whether the button should be disabled
 * @param variant - Button variant (default: "destructive")
 * @param size - Button size (default: "sm")
 * @param buttonText - Custom button text (default: "Disconnect")
 * @param onSuccess - Callback when disconnection is successful
 * @param onError - Callback when disconnection fails
 * @param showConfirmation - Whether to show confirmation dialog (default: true)
 * @param showText - Whether to show the button text (default: true)
 */
export const SlackDisconnectButton: React.FC<SlackDisconnectButtonProps> = ({
  projectId,
  disabled = false,
  variant = "destructive",
  size = "sm",
  buttonText = "Disconnect",
  onSuccess,
  onError,
  showConfirmation = true,
  showText = true,
}) => {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Disconnect mutation
  const disconnectMutation = api.slack.disconnect.useMutation({
    onSuccess: () => {
      setIsDisconnecting(false);
      setIsDialogOpen(false);

      showSuccessToast({
        title: "Slack Disconnected",
        description: "Successfully disconnected from your Slack workspace.",
      });

      onSuccess?.();
    },
    onError: (error: any) => {
      setIsDisconnecting(false);

      const errorMessage = error.message || "Failed to disconnect from Slack";

      showErrorToast("Disconnection Failed", errorMessage);

      onError?.(new Error(errorMessage));
    },
  });

  // Handle disconnect action
  const handleDisconnect = async () => {
    if (isDisconnecting) return;

    setIsDisconnecting(true);

    try {
      await disconnectMutation.mutateAsync({ projectId });
    } catch (error) {
      // Error handling is done in the mutation callbacks
      console.error("Disconnect error:", error);
    }
  };

  // Handle button click
  const handleClick = () => {
    if (showConfirmation) {
      setIsDialogOpen(true);
    } else {
      handleDisconnect();
    }
  };

  const buttonContent = (
    <>
      {isDisconnecting ? (
        <Loader2
          className={
            showText ? "mr-2 h-4 w-4 animate-spin" : "h-4 w-4 animate-spin"
          }
        />
      ) : (
        <Unlink className={showText ? "mr-2 h-4 w-4" : "h-4 w-4"} />
      )}
      {showText && (isDisconnecting ? "Disconnecting..." : buttonText)}
    </>
  );

  if (showConfirmation) {
    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={handleClick}
            disabled={disabled || isDisconnecting}
          >
            {buttonContent}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disconnect Slack Integration
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>
                Are you sure you want to disconnect your Slack workspace from
                this project?
              </p>
              <div className="space-y-2 rounded-md bg-muted p-3">
                <p className="text-sm font-medium">This will:</p>
                <ul className="ml-4 space-y-1 text-sm">
                  <li>• Remove the bot from your Slack workspace</li>
                  <li>• Disable all existing Slack automations</li>
                  <li>• Stop all future Slack notifications</li>
                  <li>• Delete stored workspace credentials</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                You can reconnect at any time, but you&apos;ll need to
                reconfigure your automations.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isDisconnecting}
    >
      {buttonContent}
    </Button>
  );
};
