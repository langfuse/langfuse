import { toast } from "sonner";
import { ErrorNotification } from "@/src/features/notifications/ErrorNotification";

const toastErrorStyleProps = {
  border: "1px solid var(--destructive)",
  backgroundColor: "var(--destructive)",
};

const toastWarningStyleProps = {
  border: "1px solid var(--warning-tint)",
  backgroundColor: "var(--warning-tint)",
};

export const showErrorToast = (
  error: string,
  description: string,
  type: "WARNING" | "ERROR" = "ERROR",
  path?: string,
) => {
  toast.custom(
    (t) => (
      <ErrorNotification
        error={error}
        description={description}
        type={type}
        path={path}
        dismissToast={toast.dismiss}
        toast={t}
      />
    ),
    {
      duration: Infinity,
      style: {
        padding: "1rem",
        borderRadius: "0.5rem",
        ...(type === "ERROR" ? toastErrorStyleProps : toastWarningStyleProps),
      },
    },
  );
};
