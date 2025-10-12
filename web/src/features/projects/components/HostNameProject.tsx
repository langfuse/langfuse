import { Card } from "@/src/components/ui/card";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import Header from "@/src/components/layouts/header";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { useTranslation } from "react-i18next";

export function HostNameProject() {
  const { t } = useTranslation();
  const uiCustomization = useUiCustomization();
  return (
    <div>
      <Header title={t("project.hostname.title")} />
      <Card className="mb-4 p-3">
        <div className="">
          <div className="mb-2 text-sm">
            {t("project.hostname.description")}
          </div>
          <CodeView
            content={`${uiCustomization?.hostname ?? window.origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`}
          />
        </div>
      </Card>
    </div>
  );
}
