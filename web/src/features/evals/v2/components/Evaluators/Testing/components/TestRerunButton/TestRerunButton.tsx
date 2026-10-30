import { Play } from "@langfuse/icons";

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
      <Play size="base" color="default" __rawClassName="mr-1.5" />
      Run again
    </Button>
  );
}
