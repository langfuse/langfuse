import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { X } from "lucide-react";

import type { JSX } from "react";

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
        <div className="text-primary m-0 text-sm leading-tight font-medium">
          {notification.message}
        </div>
        {notification.description && (
          <div className="text-primary mt-2 flex-1 text-sm leading-tight">
            {notification.description}
          </div>
        )}
      </div>
      <button
        className="text-primary flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 transition-colors duration-200"
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
