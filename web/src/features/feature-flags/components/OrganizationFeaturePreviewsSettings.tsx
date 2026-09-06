import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

import Header from "@/src/components/layouts/header";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Card } from "@/src/components/ui/card";
import {
  featurePreviewFlags,
  featurePreviewLabelKeys,
  type FeaturePreviewFlag,
} from "@/src/features/feature-flags/available-flags";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";

type ProposedChange = {
  flag: FeaturePreviewFlag;
  enabled: boolean;
};

export function OrganizationFeaturePreviewsSettings({
  orgId,
}: {
  orgId: string;
}) {
  const t = useTranslations("integrationsSettings.featurePreviews");
  const [proposedChange, setProposedChange] = useState<ProposedChange | null>(
    null,
  );
  const session = useSession();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const defaultsQuery = api.organizations.getFeatureFlagOrgDefaults.useQuery({
    orgId,
  });
  const updateDefault = api.organizations.setFeatureFlagOrgDefault.useMutation({
    onSuccess: async (_result, variables) => {
      capture("organization_settings:feature_flag_default_toggled", {
        feature: variables.flag,
        isEnabled: variables.enabled,
      });
      setProposedChange(null);
      await Promise.all([
        utils.organizations.getFeatureFlagOrgDefaults.invalidate({ orgId }),
        utils.members.allFromOrg.invalidate(),
        session.update(),
      ]);
      showSuccessToast({
        title: t("organization.defaultUpdatedTitle"),
        description: t("organization.defaultUpdatedDescription", {
          feature: t(featurePreviewLabelKeys[variables.flag]),
          state: variables.enabled ? t("enabled") : t("disabled"),
        }),
      });
    },
    onError: (error) => {
      setProposedChange(null);
      showErrorToast(t("updateFailed"), error.message);
    },
  });

  if (defaultsQuery.isError) {
    return (
      <Alert variant="destructive">
        <Alert.Title>{t("organization.unavailableTitle")}</Alert.Title>
        <Alert.Description>{defaultsQuery.error.message}</Alert.Description>
      </Alert>
    );
  }

  const selectedDefaults = new Set(defaultsQuery.data?.defaults ?? []);
  const memberCount = defaultsQuery.data?.memberCount ?? 0;
  const experimentalFeaturesEnabled =
    session.data?.environment.enableExperimentalFeatures === true;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Header title={t("organization.title")} />
        <p className="text-muted-foreground text-sm">
          {t("organization.description")}
        </p>
      </div>

      {experimentalFeaturesEnabled ? (
        <Alert>
          <Alert.Title>{t("organization.experimentalTitle")}</Alert.Title>
          <Alert.Description>
            {t("organization.experimentalDescription")}
          </Alert.Description>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {featurePreviewFlags.map((flag) => {
          const selected = selectedDefaults.has(flag);
          const enabledForAdmin =
            session.data?.user?.featureFlags[flag] === true;
          const requiresPersonalEnablement = !selected && !enabledForAdmin;
          return (
            <Card
              key={flag}
              className="flex items-start justify-between gap-6 p-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="font-bold">
                  {t(featurePreviewLabelKeys[flag])}
                </h3>
                {requiresPersonalEnablement ? (
                  <p className="text-destructive text-xs">
                    {t("organization.requiresPersonal")}
                  </p>
                ) : null}
              </div>
              <Switch
                aria-label={t("toggleOrganization", {
                  feature: t(featurePreviewLabelKeys[flag]),
                })}
                checked={experimentalFeaturesEnabled || selected}
                disabled={
                  experimentalFeaturesEnabled ||
                  defaultsQuery.isPending ||
                  updateDefault.isPending ||
                  requiresPersonalEnablement
                }
                onCheckedChange={(enabled) =>
                  setProposedChange({ flag, enabled })
                }
              />
            </Card>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {t("organization.defaultsNote")}
      </p>

      <AlertDialog
        open={proposedChange !== null}
        onOpenChange={(open) => {
          if (!open && !updateDefault.isPending) setProposedChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("organization.confirmTitle", {
                action: proposedChange?.enabled
                  ? t("organization.enable")
                  : t("organization.disable"),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization.confirmDescription", {
                action: proposedChange?.enabled
                  ? t("organization.enable").toLowerCase()
                  : t("organization.disable").toLowerCase(),
                feature: proposedChange
                  ? t(featurePreviewLabelKeys[proposedChange.flag])
                  : t("organization.thisPreview"),
                memberCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {proposedChange?.enabled ? (
            <Alert>
              <Alert.Title>{t("organization.alreadyEnabledTitle")}</Alert.Title>
              <Alert.Description>
                {t("organization.alreadyEnabledDescription")}
              </Alert.Description>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateDefault.isPending}>
              {t("organization.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={updateDefault.isPending || proposedChange === null}
              onClick={() => {
                if (!proposedChange) return;
                updateDefault.mutate({ orgId, ...proposedChange });
              }}
            >
              {t("organization.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
