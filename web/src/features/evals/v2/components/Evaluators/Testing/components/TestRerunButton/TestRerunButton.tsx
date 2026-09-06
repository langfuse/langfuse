import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useTranslations } from "next-intl";

export function TestRerunButton({
  isPending,
  disabledReason,
  onRerun,
}: {
  isPending: boolean;
  disabledReason: string | null;
  onRerun: () => void;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      disabled={disabledReason !== null}
      title={disabledReason ?? t("test.runAgainTitle")}
      onClick={onRerun}
    >
      <Play className="mr-1.5 h-3.5 w-3.5" />
      {t("test.runAgain")}
    </Button>
  );
}
