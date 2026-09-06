import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Button } from "@/src/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { PopoverContent } from "@/src/components/ui/popover";
import {
  featurePreviewFlags,
  featurePreviewLabelKeys,
  type FeaturePreviewFlag,
} from "@/src/features/feature-flags/available-flags";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";

type FeaturePreviewManagement = {
  allowed: boolean;
};

export function UserFeaturePreviewsControl({
  orgId,
  userId,
  featurePreviews,
  management,
  children,
}: {
  orgId: string;
  userId: string;
  featurePreviews: Record<FeaturePreviewFlag, boolean>;
  management: FeaturePreviewManagement;
  children: (props: {
    enabledCount: number;
    totalCount: number;
    content: ReactNode;
  }) => ReactNode;
}) {
  const t = useTranslations("integrationsSettings.featurePreviews");
  const session = useSession();
  const [pendingFlags, setPendingFlags] = useState<Set<FeaturePreviewFlag>>(
    new Set(),
  );
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const updatePreview = api.members.setUserFeaturePreviewEnabled.useMutation({
    onSuccess: async (_result, variables) => {
      capture("organization_settings:user_feature_flag_toggled", {
        feature: variables.flag,
        isEnabled: variables.enabled,
      });
      await utils.members.allFromOrg.invalidate();
      if (variables.userId === session.data?.user?.id) {
        await session.update();
      }
      showSuccessToast({
        title: t("updatedTitle"),
        description: t("updatedDescription", {
          feature: t(featurePreviewLabelKeys[variables.flag]),
          state: variables.enabled ? t("enabled") : t("disabled"),
        }),
      });
    },
    onError: async () => {
      await utils.members.allFromOrg.invalidate();
      showErrorToast(t("updateFailed"), t("accessChanged"));
    },
  });
  const enabledCount = Object.values(featurePreviews).filter(Boolean).length;
  const totalCount = featurePreviewFlags.length;

  if (!management.allowed) {
    return (
      <HoverCard openDelay={0} closeDelay={0}>
        <HoverCardTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <Button variant="outline" size="sm" disabled>
              {t("enabledCount", { enabledCount, totalCount })}
            </Button>
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="center" side="left">
          <p className="text-xs">{t("managementBlocked")}</p>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return children({
    enabledCount,
    totalCount,
    content: (
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          <div>
            <h4 className="text-sm font-bold">{t("popoverTitle")}</h4>
            <p className="text-muted-foreground text-xs">
              {t("popoverDescription")}
            </p>
          </div>
          {featurePreviewFlags.map((flag) => (
            <div key={flag} className="flex items-center justify-between gap-4">
              <span className="text-sm">
                {t(featurePreviewLabelKeys[flag])}
              </span>
              <Switch
                size="sm"
                aria-label={t("toggleUser", {
                  feature: t(featurePreviewLabelKeys[flag]),
                })}
                checked={featurePreviews[flag]}
                disabled={pendingFlags.has(flag)}
                onCheckedChange={(enabled) => {
                  setPendingFlags((current) => new Set(current).add(flag));
                  updatePreview.mutate(
                    {
                      orgId,
                      userId,
                      flag,
                      enabled,
                    },
                    {
                      onSettled: () => {
                        setPendingFlags((current) => {
                          const next = new Set(current);
                          next.delete(flag);
                          return next;
                        });
                      },
                    },
                  );
                }}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    ),
  });
}
