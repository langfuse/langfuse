import { ActionButton } from "@/src/components/ActionButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Zap } from "lucide-react";
import { type ButtonProps } from "@/src/components/ui/button";

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

  return (
    <ActionButton
      href={`/project/${projectId}/automations`}
      icon={<Zap className="h-4 w-4" aria-hidden="true" />}
      hasAccess={hasAccess}
      title="Webhooks"
      {...buttonProps}
    >
      <span className="hidden md:ml-1 md:inline">Webhooks</span>
    </ActionButton>
  );
};
