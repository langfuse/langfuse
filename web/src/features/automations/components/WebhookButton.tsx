import { ActionButton } from "@/src/components/ActionButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Zap, Loader2 } from "lucide-react";
import { type ButtonProps } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";

export const WebhookButton = ({
  projectId,
  ...buttonProps
}: {
  projectId: string;
} & ButtonProps) => {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });

  const numberOfWebHooks = api.automations.count.useQuery({
    projectId,
    type: "WEBHOOK",
  });

  const numberIndicator = numberOfWebHooks.isLoading ? (
    <span className="ml-1.5 inline-flex w-6 items-center justify-center rounded-sm bg-transparent px-1 text-xs">
      <Loader2 className="h-3 w-3 animate-spin" />
    </span>
  ) : (
    <span
      className={
        "ml-1.5 inline-flex w-6 items-center justify-center rounded-sm bg-input px-1 text-xs shadow-sm @6xl:inline @6xl:hidden"
      }
    >
      {numberOfWebHooks.data}
    </span>
  );

  return (
    <ActionButton
      href={`/project/${projectId}/automations`}
      icon={<Zap className="h-4 w-4" aria-hidden="true" />}
      hasAccess={hasAccess}
      title="Webhooks"
      variant="outline"
      {...buttonProps}
    >
      <span className="hidden md:ml-1 md:inline">
        Webhooks
        {numberIndicator}
      </span>
    </ActionButton>
  );
};
