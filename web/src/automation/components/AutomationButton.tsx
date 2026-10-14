import { ActionButton } from "@/src/app/components/ActionButton";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { Zap } from "lucide-react";
import { api } from "@/src/app/utils/api";
import { Spinner } from "@/src/app/design-system/Spinner/Spinner";

type AutomationButtonProps = {
  projectId: string;
};

export const AutomationButton = ({ projectId }: AutomationButtonProps) => {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });

  const numberOfAutomations = api.automations.count.useQuery({
    projectId,
  });

  const numberIndicator = numberOfAutomations.isLoading ? (
    <span className="ml-1.5 inline-flex w-6 items-center justify-center rounded-sm bg-transparent px-1 text-xs">
      <Spinner size="xxs" />
    </span>
  ) : (
    <span className="bg-input ml-1.5 inline-flex w-6 items-center justify-center rounded-sm px-1 text-xs shadow-xs @6xl:inline">
      {numberOfAutomations.data}
    </span>
  );

  return (
    <ActionButton
      href={`/project/${projectId}/automations`}
      icon={<Zap className="icon-base" aria-hidden="true" />}
      hasAccess={hasAccess}
      title="Automations"
      variant="outline"
    >
      <span className="hidden md:ml-1 md:inline">
        Automations
        {numberIndicator}
      </span>
    </ActionButton>
  );
};
