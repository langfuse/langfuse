import { toast } from "sonner";
import {
  Notification,
  type NotificationProps,
} from "@/src/features/notifications/Notification";

export const showNotificationToast = ({
  duration = 5000,
  ...params
}: Omit<NotificationProps, "dismissToast" | "toast"> & {
  duration?: number;
}) => {
  toast.custom(
    (t) => <Notification {...params} toast={t} dismissToast={toast.dismiss} />,
    {
      duration,
      style: {
        padding: "1rem",
        border: "1px solid hsl(var(--border))",
        borderRadius: "0.5rem",
        backgroundColor: "hsl(var(--border))",
      },
    },
  );
};
