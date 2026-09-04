import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function TestRerunButton({
  isPending,
  disabledReason,
  onRerun,
}: {
  isPending: boolean;
  disabledReason: string | null;
  onRerun: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      disabled={disabledReason !== null}
      title={disabledReason ?? "Run the test again"}
      onClick={onRerun}
    >
      <Play className="mr-1.5 h-3.5 w-3.5" />
      Run again
    </Button>
  );
}
