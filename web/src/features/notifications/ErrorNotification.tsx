import { Button } from "@/src/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import {
  chatAvailable,
  sendUserChatMessage,
} from "@/src/features/support-chat/chat";

interface ErrorNotificationProps {
  error: string;
  description: string;
  cause?: string;
  dismissToast: (t?: string | number | undefined) => void;
  toast: string | number;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  description,
  cause,
  dismissToast,
  toast,
}) => {
  const handleReportIssueClick = () => {
    if (chatAvailable) {
      const message = `I received the following error:\n\nError: ${error}\nDescription: ${description}\n ${cause ? `Cause: ${cause}\n` : ""}`;
      sendUserChatMessage(message);
      dismissToast(toast);
    }
  };

  return (
    <div className="flex justify-between">
      <div className="flex min-w-[300px] flex-1 flex-col">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-destructive-foreground" />
          <div className="m-0 text-sm font-medium leading-tight text-destructive-foreground">
            {error}
          </div>
        </div>
        {description && (
          <div className="my-2 text-sm leading-tight text-destructive-foreground">
            {description}
          </div>
        )}
        {cause && (
          <div className="mb-2 max-h-32 overflow-y-auto text-sm leading-tight text-destructive-foreground">
            {cause}
          </div>
        )}
        {chatAvailable && (
          <Button
            variant="errorNotification"
            size={"sm"}
            onClick={() => {
              handleReportIssueClick();
            }}
          >
            Report issue to langfuse team
          </Button>
        )}
      </div>
      <button
        className="flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 text-destructive-foreground transition-colors duration-200"
        onClick={() => dismissToast(toast)}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
