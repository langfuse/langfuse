import { toast } from "sonner";
import { ErrorNotification } from "@/src/features/notifications/ErrorNotification";

const isServerError = (httpStatus: number): boolean => {
  return httpStatus >= 500 && httpStatus < 600;
};

const toastErrorStyleProps = {
  border: "1px solid hsl(var(--destructive))",
  backgroundColor: "hsl(var(--destructive))",
};

const toastWarningStyleProps = {
  border: "1px solid hsl(var(--light-yellow))",
  backgroundColor: "hsl(var(--light-yellow))",
};

export const showErrorToast = (
  error: string,
  description: string,
  httpStatus: number,
  cause?: string,
  path?: string,
) => {
  const isError = isServerError(httpStatus);

  toast.custom(
    (t) => (
      <ErrorNotification
        error={error}
        description={description}
        type={isError ? "ERROR" : "WARNING"}
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
        borderRadius: "0.5rem",
        ...(isError ? toastErrorStyleProps : toastWarningStyleProps),
      },
    },
  );
};
