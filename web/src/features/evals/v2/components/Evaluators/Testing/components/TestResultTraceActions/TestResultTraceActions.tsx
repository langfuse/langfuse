import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { ExternalLink, MoreVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";

export const TestResultTraceActionsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button>
>(function TestResultTraceActionsTrigger({ title, ...props }, ref) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Button
      {...props}
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      title={title ?? t("more")}
    >
      <MoreVertical className="h-3.5 w-3.5" />
    </Button>
  );
});

export function TestResultTraceActions({
  children,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  children: ReactNode;
  executionTraceId: string | null;
  onOpenExecutionTrace: ((executionTraceId: string) => void) | null;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const openExecutionTrace =
    executionTraceId && onOpenExecutionTrace
      ? () => onOpenExecutionTrace(executionTraceId)
      : null;

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent align="end">
        {openExecutionTrace ? (
          <DropdownMenuItem onClick={openExecutionTrace}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            {t("test.openExecutionTrace")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
