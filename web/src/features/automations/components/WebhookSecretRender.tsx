import React from "react";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { useTranslations } from "next-intl";

export const WebhookSecretRender = ({
  webhookSecret,
}: {
  webhookSecret: string;
}) => {
  const t = useTranslations("auxSettings.webhookSecret");

  return (
    <>
      <div className="mb-4">
        <div className="font-bold">{t("title")}</div>
        <div className="my-2 text-sm">{t("description")}</div>
        <CodeView content={webhookSecret} defaultCollapsed={false} />
      </div>
    </>
  );
};
