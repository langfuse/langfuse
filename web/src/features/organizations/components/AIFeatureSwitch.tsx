/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useLangfuseCloudRegion,
  useQueryOrganization,
} from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { ExternalLink } from "@langfuse/icons";
import { useSession } from "next-auth/react";
import { AIFeatureSettingRow } from "@/src/features/organizations/components/AIFeatureSettingRow";

export default function AIFeatureSwitch() {
  const { data: session, update: updateSession } = useSession();
  const utils = api.useUtils();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const aiFeaturesTracingConfigured =
    session?.environment.aiFeaturesTracingConfigured === true;
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const aiFeaturesEnabled = organization?.aiFeaturesEnabled;
  const aiTelemetryEnabled = organization?.aiTelemetryEnabled;
  const [isAIFeatureSwitchEnabled, setIsAIFeatureSwitchEnabled] = useState(
    aiFeaturesEnabled ?? false,
  );
  const [isAITelemetrySwitchEnabled, setIsAITelemetrySwitchEnabled] = useState(
    aiTelemetryEnabled ?? true,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });

  const updateAIFeatures = api.organizations.update.useMutation({
    onSuccess: async () => {
      await updateSession();
      setConfirmOpen(false);
    },
    onError: () => {
      setConfirmOpen(false);
    },
  });

  const updateAITelemetry = api.organizations.update.useMutation({
    onSuccess: async () => {
      await updateSession();
      utils.inAppAgent.telemetryProject.invalidate();
    },
    onError: () => {
      setIsAITelemetrySwitchEnabled(aiTelemetryEnabled ?? true);
    },
  });

  useEffect(() => {
    if (aiFeaturesEnabled === undefined || aiTelemetryEnabled === undefined) {
      return;
    }

    if (!confirmOpen && !updateAIFeatures.isPending) {
      setIsAIFeatureSwitchEnabled(aiFeaturesEnabled);
    }

    if (!updateAITelemetry.isPending) {
      setIsAITelemetrySwitchEnabled(aiTelemetryEnabled);
    }
  }, [
    aiFeaturesEnabled,
    aiTelemetryEnabled,
    confirmOpen,
    updateAIFeatures.isPending,
    updateAITelemetry.isPending,
  ]);

  function handleSwitchChange(newValue: boolean) {
    if (!hasAccess) return;
    setIsAIFeatureSwitchEnabled(newValue);
    setConfirmOpen(true);
  }

  function handleTelemetrySwitchChange(newValue: boolean) {
    if (!organization || !hasAccess) return;
    setIsAITelemetrySwitchEnabled(newValue);
    capture("organization_settings:ai_telemetry_toggle");
    updateAITelemetry.mutate({
      orgId: organization.id,
      aiTelemetryEnabled: newValue,
    });
  }

  function handleCancel() {
    setIsAIFeatureSwitchEnabled(organization?.aiFeaturesEnabled ?? false);
    setConfirmOpen(false);
  }

  function handleConfirm() {
    if (!organization || !hasAccess) return;
    capture("organization_settings:ai_features_toggle");
    updateAIFeatures.mutate({
      orgId: organization.id,
      aiFeaturesEnabled: isAIFeatureSwitchEnabled,
    });
  }

  return (
    <div>
      <Header title="AI Features" />
      <Card className="mb-4 p-3">
        <AIFeatureSettingRow
          title="Enable AI powered features for your organization"
          description={
            isLangfuseCloud ? (
              <>
                This setting applies to all users and projects. Any data{" "}
                <i>can</i> be sent to AWS Bedrock within the Langfuse data
                region. Your data will not be used to train models. Applicable
                HIPAA, SOC2, GDPR, and ISO 27001 compliance remains intact.{" "}
                <a
                  href="https://langfuse.com/security/ai-features"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  More details in the docs here.
                  <ExternalLink size="sm" />
                </a>
              </>
            ) : (
              "This setting applies to all users and projects. When enabled, Halo can send relevant project data to the model provider configured by your instance administrator."
            )
          }
          checked={isAIFeatureSwitchEnabled}
          onCheckedChange={handleSwitchChange}
          disabled={!hasAccess}
          locked={!hasAccess}
        />
        {isLangfuseCloud &&
          isAIFeatureSwitchEnabled &&
          aiFeaturesTracingConfigured && (
            <div className="mt-4 border-t pt-4">
              <AIFeatureSettingRow
                title="AI Data Use for Product/Service Improvement"
                description="Share data about your use of AI with Langfuse for product and service improvement."
                checked={isAITelemetrySwitchEnabled}
                onCheckedChange={handleTelemetrySwitchChange}
                disabled={!hasAccess || updateAITelemetry.isPending}
                locked={!hasAccess}
              />
            </div>
          )}
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && !updateAIFeatures.isPending) {
            handleCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm AI Features Change</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <span className="text-sm">
              You are about to{" "}
              <strong>
                {isAIFeatureSwitchEnabled ? "enable " : "disable"}
              </strong>{" "}
              AI features for your organization. When enabled, relevant data can
              be sent{" "}
              {isLangfuseCloud
                ? "to AWS Bedrock in your data region"
                : "to the model provider configured by your instance administrator"}{" "}
              for processing.
              {isLangfuseCloud && (
                <>
                  <br />
                  <br />{" "}
                  <a
                    href="https://langfuse.com/security/ai-features"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    Learn more in the docs.
                    <ExternalLink size="sm" />
                  </a>
                </>
              )}
            </span>
            <p className="text-muted-foreground mt-3 text-sm">
              Are you sure you want to proceed?
            </p>
          </DialogBody>
          <DialogFooter>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                disabled={updateAIFeatures.isPending}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleConfirm}
                loading={updateAIFeatures.isPending}
              >
                Confirm
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
