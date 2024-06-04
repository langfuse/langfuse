import { toast } from "sonner";
import { ErrorNotification } from "@/src/features/notifications/ErrorNotification";

export const showErrorToast = (
  error: string,
  description: string,
  cause?: string,
  path?: string,
) => {
  toast.custom(
    (t) => (
      <ErrorNotification
        error={error}
        description={description}
        cause={cause}
        path={path}
        dismissToast={toast.dismiss}
        toast={t}
      />
    ),
    {
      duration: Infinity,
      style: {
        padding: "1rem",
        border: "1px solid hsl(var(--destructive))",
        borderRadius: "0.5rem",
        backgroundColor: "hsl(var(--destructive))",
      },
    },
  );
};
