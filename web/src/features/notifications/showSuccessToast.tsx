import { toast } from "sonner";
import {
  SuccessNotification,
  type SuccessNotificationProps,
} from "@/src/features/notifications/SuccessNotification";

export const showSuccessToast = (
  params: Omit<SuccessNotificationProps, "onDismiss">,
) => {
  toast.custom(
    (t) => (
      <SuccessNotification {...params} onDismiss={() => toast.dismiss(t)} />
    ),
    {
      duration: 5000,
      style: {
        padding: "1rem",
        border: "1px solid hsl(var(--dark-green))",
        borderRadius: "0.5rem",
        backgroundColor: "hsl(var(--dark-green))",
      },
    },
  );
};
