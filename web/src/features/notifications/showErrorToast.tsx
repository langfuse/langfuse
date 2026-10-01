import { toast } from "sonner";
import { ErrorNotification } from "@/src/features/notifications/ErrorNotification";

const toastErrorStyleProps = {
  border: "1px solid hsl(var(--destructive))",
  backgroundColor: "hsl(var(--destructive))",
};

// `--light-yellow` is a tint with baked-in alpha, meant to sit on top of a
// solid surface. A toast floats over arbitrary page content, so the tint is
// layered over an opaque background here rather than used as the background
// itself — otherwise the page shows through the toast.
const toastWarningStyleProps = {
  border: "1px solid var(--dark-yellow)",
  backgroundColor: "hsl(var(--background))",
  backgroundImage: "linear-gradient(var(--light-yellow), var(--light-yellow))",
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
