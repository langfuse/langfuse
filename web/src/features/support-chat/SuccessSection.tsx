import { Button } from "@/src/components/ui/button";

export function SuccessSection({
  onClose,
  onAnother,
}: {
  onClose: () => void;
  onAnother: () => void;
}) {
  return (
    <div className="mt-1 space-y-3">
      <div className="rounded-md border p-4">
        <div className="text-sm font-medium">Thanks for your message</div>
        <div className="text-sm text-muted-foreground">
          We created a support ticket and will reply via email.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onClose}>Close</Button>
        <Button variant="ghost" onClick={onAnother}>
          Submit another
        </Button>
      </div>
    </div>
  );
}
