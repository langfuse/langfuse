import { ListRestartIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

import { Button } from "@/src/components/ui/button";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";

export const ResetPlaygroundButton: React.FC = () => {
  const t = useTranslations("coreDetails.playground.reset");
  const router = useRouter();
  const { clearAllCache } = usePersistedWindowIds();

  const handleClick = () => {
    clearAllCache();
    router.reload();
  };

  return (
    <Button
      variant="outline"
      title={t("title")}
      onClick={handleClick}
      className="gap-1"
    >
      <ListRestartIcon className="h-4 w-4" />
      <span className="hidden lg:inline">{t("action")}</span>
    </Button>
  );
};
