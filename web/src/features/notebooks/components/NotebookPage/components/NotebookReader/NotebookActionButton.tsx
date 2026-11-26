import { useRef, useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";

export function NotebookActionButton({
  label,
  execute,
  saved,
}: {
  label: string;
  saved: boolean;
  execute?: () => Promise<unknown>;
}) {
  const running = useRef(false);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");

  return (
    <div className="space-y-1">
      <Button
        shouldFill
        text={status === "pending" ? `${label}…` : label}
        aria-pressed={saved}
        variant={saved ? "primary" : "outline"}
        disabled={!execute || status === "pending"}
        onClick={async () => {
          if (!execute || running.current) return;
          running.current = true;
          setStatus("pending");
          try {
            await execute();
            setStatus("idle");
          } catch {
            setStatus("error");
          } finally {
            running.current = false;
          }
        }}
      />
      {saved && status === "idle" && (
        <p role="status" className="text-sm">
          Saved rating: {label}.
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm">
          Could not save. Try again.
        </p>
      )}
    </div>
  );
}
