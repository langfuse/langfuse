"use client";

import { useTranslation } from "react-i18next";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function ExampleI18nComponent() {
  const { t } = useTranslation();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t("common.labels.welcome")}</span>
          <LanguageSwitcher />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold">{t("common.labels.dashboard")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("common.labels.description")}
          </p>
        </div>

        <div className="flex space-x-2">
          <Button>{t("common.actions.save")}</Button>
          <Button variant="outline">{t("common.actions.cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
