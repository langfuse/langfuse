import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
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
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  useLangfuseCloudRegion,
  useQueryOrganization,
} from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { LockIcon, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";

export default function AIFeatureSwitch() {
  const { update: updateSession } = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
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

  if (!isLangfuseCloud) return null;

  return (
    <div>
      <Header title="AI Features" />
      <Card className="mb-4 p-3">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <h4 className="font-semibold">
              Enable AI powered features for your organization
            </h4>
            <p className="text-sm">
              This setting applies to all users and projects. Any data{" "}
              <i>can</i> be sent to AWS Bedrock within the Langfuse data region.
              Traces are sent to Langfuse Cloud in your data region. Your data
              will not be used for training models. Applicable HIPAA, SOC2,
              GDPR, and ISO 27001 compliance remains intact.{" "}
              <a
                href="https://langfuse.com/security/ai-features"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                More details in the docs here.
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
          <div className="relative">
            <Switch
              checked={isAIFeatureSwitchEnabled}
              onCheckedChange={handleSwitchChange}
              disabled={!hasAccess}
            />
            {!hasAccess && (
              <span title="No access">
                <LockIcon className="text-muted absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform" />
              </span>
            )}
          </div>
        </div>
        {isAIFeatureSwitchEnabled && (
          <div className="mt-4 flex flex-row items-center justify-between border-t pt-4">
            <div className="flex flex-col gap-1">
              <h4 className="font-semibold">
                AI Data Use for Product/Service Improvement
              </h4>
              <p className="text-sm">
                Share data about your use of AI with Langfuse for product and
                service improvement.
              </p>
            </div>
            <div className="relative">
              <Switch
                checked={isAITelemetrySwitchEnabled}
                onCheckedChange={handleTelemetrySwitchChange}
                disabled={!hasAccess || updateAITelemetry.isPending}
              />
              {!hasAccess && (
                <span title="No access">
                  <LockIcon className="text-muted absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 transform" />
                </span>
              )}
            </div>
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
              AI features for your organization. When enabled, any data{"  "}
              <i>can</i> be sent to AWS Bedrock in your data region for
              processing.
              <br />
              <br />{" "}
              <a
                href="https://langfuse.com/security/ai-features"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                Learn more in the docs.
                <ExternalLink className="h-3 w-3" />
              </a>
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
