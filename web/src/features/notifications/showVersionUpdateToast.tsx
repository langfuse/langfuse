import { Button } from "@/src/components/ui/button";
import { toast } from "sonner";

export const showVersionUpdateToast = () => {
  toast.custom(
    () => (
      <div className="flex justify-between">
        <div className="flex min-w-[300px] flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="m-0 text-sm font-medium leading-tight text-foreground/70">
              We have released a new version of Langfuse. Please refresh your
              browser to get the latest update.
            </div>
          </div>
          <Button
            variant="outline"
            size={"sm"}
            className="text-foreground/50"
            onClick={() => {
              window.location.reload();
            }}
          >
            Refresh page
          </Button>
        </div>
      </div>
    ),
    {
      duration: Infinity,
      style: {
        padding: "1rem",
        borderRadius: "0.5rem",
        border: "1px solid hsl(var(--border))",
        backgroundColor: "hsl(var(--border))",
      },
    },
  );
};
