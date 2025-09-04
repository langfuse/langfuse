import { Button } from "@/src/components/ui/button";
import { Separator } from "@/src/components/ui/separator";
import { CheckCircle2 } from "lucide-react";
import { IntroSection } from "@/src/features/support-chat/IntroSection";

export function SuccessSection({
  onAnother,
}: {
  onClose: () => void;
  onAnother: () => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-6">
      {/* Success card */}
      <div className="rounded-md border p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Thanks for your message</div>
            <div className="text-sm text-muted-foreground">
              We created a support ticket and will reply via email.
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div className="mt-4 flex flex-wrap items-center justify-start gap-2 pl-7">
          <Button variant="outline" size="sm" onClick={onAnother}>
            Submit another
          </Button>
        </div>
      </div>

      <Separator />

      <IntroSection onStartForm={() => onAnother()} />
    </div>
  );
}
