import { toast } from "sonner";
import {
  SuccessNotification,
  type SuccessNotificationProps,
} from "@/src/features/notifications/SuccessNotification";

export const showSuccessToast = ({
  duration = 5000,
  ...params
}: Omit<SuccessNotificationProps, "onDismiss"> & { duration?: number }) => {
  toast.custom(
    (t) => (
      <SuccessNotification {...params} onDismiss={() => toast.dismiss(t)} />
    ),
    {
      duration,
      style: {
        padding: "1rem",
        border: "1px solid hsl(var(--dark-green))",
        borderRadius: "0.5rem",
        backgroundColor: "hsl(var(--dark-green))",
      },
    },
  );
};
