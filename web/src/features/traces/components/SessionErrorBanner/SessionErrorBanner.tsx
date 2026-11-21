import { Button } from "@/src/components/design-system/Button/Button";

export function SessionErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
      <span role="alert">
        Session unavailable.{" "}
        <Button text="Retry" variant="text" onClick={onRetry} /> or switch to
        Trace.
      </span>
    </div>
  );
}
