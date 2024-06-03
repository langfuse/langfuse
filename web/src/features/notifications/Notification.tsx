import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { X } from "lucide-react";

export interface TNotification {
  id: number;
  releaseDate: Date;
  message: string | JSX.Element;
  description?: JSX.Element | string;
}

interface NotificationProps {
  notification: TNotification;
  setLastSeenId: (id: number) => void;
  dismissToast: (t?: string | number | undefined) => void;
  toast: string | number;
}

export const Notification: React.FC<NotificationProps> = ({
  notification,
  setLastSeenId,
  dismissToast,
  toast,
}) => {
  const capture = usePostHogClientCapture();
  return (
    <div className="flex justify-between">
      <div className="flex min-w-[300px] flex-1 flex-col justify-center">
        <div className="m-0 text-sm font-medium leading-tight text-primary">
          {notification.message}
        </div>
        {notification.description && (
          <div className="mt-2 flex-1 text-sm leading-tight text-primary">
            {notification.description}
          </div>
        )}
      </div>
      <button
        className="flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 text-primary transition-colors duration-200"
        onClick={() => {
          capture("notification:dismiss_notification", {
            notificationId: notification.id,
          });
          setLastSeenId(notification.id);
          dismissToast(toast);
        }}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
};
