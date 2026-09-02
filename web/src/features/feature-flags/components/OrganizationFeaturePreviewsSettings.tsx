import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { useState } from "react";
import { useSession } from "next-auth/react";

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
  featurePreviewLabels,
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
        title: "Feature preview default updated",
        description: `${featurePreviewLabels[variables.flag]} was ${
          variables.enabled ? "enabled" : "disabled"
        } for this organization.`,
      });
    },
    onError: (error) => {
      setProposedChange(null);
      showErrorToast("Failed to update feature preview", error.message);
    },
  });

  if (defaultsQuery.isError) {
    return (
      <Alert variant="destructive">
        <Alert.Title>Feature previews unavailable</Alert.Title>
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
        <Header title="Feature Previews" />
        <p className="text-muted-foreground text-sm">
          Enable previews for everyone while they are using this organization.
          New members inherit these defaults automatically.
        </p>
      </div>

      {experimentalFeaturesEnabled ? (
        <Alert>
          <Alert.Title>
            Experimental features enabled deployment-wide
          </Alert.Title>
          <Alert.Description>
            Every preview on this page is enabled by the env variable
            LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true. Per-user opt-outs do not
            disable these previews.
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
                <h3 className="font-bold">{featurePreviewLabels[flag]}</h3>
                {requiresPersonalEnablement ? (
                  <p className="text-destructive text-xs">
                    Enable this preview in your personal Feature Preview
                    settings before enabling it for the organization.
                  </p>
                ) : null}
              </div>
              <Switch
                aria-label={`Toggle ${featurePreviewLabels[flag]} organization default`}
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
        Defaults apply only in this organization. A user&apos;s global personal
        opt-out always wins.
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
              {proposedChange?.enabled ? "Enable" : "Disable"} feature preview?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will {proposedChange?.enabled ? "enable" : "disable"}{" "}
              {proposedChange
                ? featurePreviewLabels[proposedChange.flag]
                : "this preview"}{" "}
              for up to {memberCount} current member
              {memberCount === 1 ? "" : "s"}. New members inherit enabled
              organization defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {proposedChange?.enabled ? (
            <Alert>
              <Alert.Title>Already enabled for you</Alert.Title>
              <Alert.Description>
                This preview is already enabled in your personal Feature Preview
                settings. Make sure you have tested it before enabling it for
                the organization.
              </Alert.Description>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateDefault.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={updateDefault.isPending || proposedChange === null}
              onClick={() => {
                if (!proposedChange) return;
                updateDefault.mutate({ orgId, ...proposedChange });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
