import Header from "@/src/components/layouts/header";
import React from "react";
import { useTranslation } from "next-i18next";

export const SettingsDangerZone: React.FC<{
  items: {
    title: string;
    description: string;
    button: React.ReactNode;
  }[];
}> = ({ items }) => {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-3">
      <Header title={t("settings.dangerZone")} />
      <div className="rounded-lg border">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 border-b p-3 last:border-b-0"
          >
            <div>
              <h4 className="font-semibold">{item.title}</h4>
              <p className="text-sm">{item.description}</p>
            </div>
            {item.button}
          </div>
        ))}
      </div>
    </div>
  );
};
