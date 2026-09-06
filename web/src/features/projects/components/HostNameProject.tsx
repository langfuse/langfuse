import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { useTranslations } from "next-intl";

export function HostNameProject() {
  const t = useTranslations("settingsEnterprise.generalSettings.host");
  const uiCustomization = useUiCustomization();
  return (
    <div>
      <Header title={t("title")} />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">{t("description")}</div>
          <CodeView
            content={`${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`}
          />
        </div>
      </Card>
    </div>
  );
}
