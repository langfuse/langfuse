import { CloseIcon } from "@/src/features/notifications/CloseIcon";

export interface TNotification {
  id: number;
  // MM/DD/YYYY
  releaseDate: string;
  message: string | JSX.Element;
  description?: JSX.Element | string;
}

interface NotificationProps {
  notification: TNotification;
  setLastSeenId: (id: number) => void;
  dismissToast: (t?: string | number | undefined) => void;
  toast: string | number;
}

const Notification: React.FC<NotificationProps> = ({
  notification,
  setLastSeenId,
  dismissToast,
  toast,
}) => (
  <div className="flex justify-between">
    <div className="flex min-w-[300px] flex-1 flex-col justify-center">
      <div className="m-0 text-sm font-medium leading-tight text-gray-800">
        {notification.message}
      </div>
      {notification.description && (
        <div className="mt-2 flex-1 text-sm leading-tight text-gray-800">
          {notification.description}
        </div>
      )}
    </div>
    <button
      className="flex h-6 w-6 cursor-pointer items-start justify-end border-none bg-transparent p-0 text-gray-800 transition-colors duration-200"
      onClick={() => {
        setLastSeenId(notification.id);
        dismissToast(toast);
      }}
      aria-label="Close"
    >
      <CloseIcon />
    </button>
  </div>
);

export default Notification;
