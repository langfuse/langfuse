import { type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useTranslations } from "next-intl";

export function openAIFeaturesSettings(organizationId: string) {
  window.open(
    `/organization/${organizationId}/settings`,
    "_blank",
    "noopener,noreferrer",
  );
}

export function AIFeaturesDisabledNotice({
  organizationId,
  children,
  onSettingsOpened,
}: {
  organizationId: string | undefined;
  children: ReactNode;
  onSettingsOpened?: () => void;
}) {
  const t = useTranslations("settingsEnterprise.generalSettings.aiDisabled");
  const canUpdateOrgSettings = useHasOrganizationAccess({
    organizationId,
    scope: "organization:update",
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {children}
        {!canUpdateOrgSettings ? <> {t("askAdmin")}</> : null}
      </p>
      {canUpdateOrgSettings && organizationId ? (
        <Button
          onClick={() => {
            openAIFeaturesSettings(organizationId);
            onSettingsOpened?.();
          }}
          variant="outline"
          size="sm"
          className="w-fit"
        >
          {t("enable")}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
