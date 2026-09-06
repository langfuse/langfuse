import { ActionButton } from "@/src/components/ActionButton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { Zap } from "lucide-react";
import { api } from "@/src/utils/api";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

type AutomationButtonProps = {
  projectId: string;
};

export const AutomationButton = ({ projectId }: AutomationButtonProps) => {
  const t = useTranslations("remainderUi.automations");
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
      icon={<Zap className="h-4 w-4" aria-hidden="true" />}
      hasAccess={hasAccess}
      title={t("title")}
      variant="outline"
    >
      <span className="hidden md:ml-1 md:inline">
        {t("title")}
        {numberIndicator}
      </span>
    </ActionButton>
  );
};
