import { Button } from "@/src/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import {
  chatAvailable,
  sendUserChatMessage,
} from "@/src/features/support-chat/chat";

interface ErrorNotificationProps {
  error: string;
  description: string;
  type: "WARNING" | "ERROR";
  cause?: string;
  dismissToast: (t?: string | number | undefined) => void;
  toast: string | number;
  path?: string;
}

export const ErrorNotification: React.FC<ErrorNotificationProps> = ({
  error,
  description,
  type,
  cause,
  dismissToast,
  toast,
  path,
}) => {
  const isError = type === "ERROR";
  const textColor = isError
    ? "text-destructive-foreground"
    : "text-dark-yellow";

  const handleReportIssueClick = () => {
    if (chatAvailable) {
      const currentUrl = window.location.href;
      const message = `I received the following error:\n\nError: ${error}\nDescription: ${description}\n ${cause ? `Cause: ${cause}\n` : ""}${path ? `Path: ${path}\n` : ""}URL: ${currentUrl}`;
      sendUserChatMessage(message);
      dismissToast(toast);
    }
  };

  return (
    <div className="flex justify-between">
      <div className="flex min-w-[300px] flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className={textColor} />
          <div className={`m-0 text-sm font-medium leading-tight ${textColor}`}>
            {error}
          </div>
        </div>
        {description && (
          <div className={`text-sm leading-tight ${textColor}`}>
            {description}
          </div>
        )}
        {path && (
          <div className={`text-sm leading-tight ${textColor}`}>
            Path: {path}
          </div>
        )}
        {cause && (
          <div
            className={`max-h-32 overflow-y-auto text-sm leading-tight ${textColor}`}
          >
            {cause}
          </div>
        )}
        {isError && chatAvailable && (
          <Button
            variant="errorNotification"
            size={"sm"}
            onClick={() => {
              handleReportIssueClick();
            }}
          >
            Report issue to Langfuse team
          </Button>
        )}
      </div>
      <button
        className={`flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 ${textColor} transition-colors duration-200`}
        onClick={() => dismissToast(toast)}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
