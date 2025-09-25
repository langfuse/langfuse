import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { api } from "@/src/utils/api";
import { useState } from "react";
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
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { Card } from "@/src/components/ui/card";
import { LockIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";

const aiFeaturesSchema = z.object({
  aiFeaturesEnabled: z.boolean(),
});

export default function AIFeatureSwitch() {
  const { update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const [isAIFeatureSwitchEnabled, setIsAIFeatureSwitchEnabled] = useState(
    organization?.aiFeaturesEnabled ?? false,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });

  const confirmForm = useForm<z.infer<typeof aiFeaturesSchema>>({
    resolver: zodResolver(aiFeaturesSchema),
    defaultValues: {
      aiFeaturesEnabled: isAIFeatureSwitchEnabled,
    },
  });

  const updateAIFeatures = api.organizations.update.useMutation({
    onSuccess: () => {
      void updateSession();
      setConfirmOpen(false);
    },
    onError: () => {
      setConfirmOpen(false);
    },
  });

  function handleSwitchChange(newValue: boolean) {
    if (!hasAccess) return;
    setIsAIFeatureSwitchEnabled(newValue);
    confirmForm.setValue("aiFeaturesEnabled", newValue);
    setConfirmOpen(true);
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
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <h4 className="font-semibold">
              Enable AI Features for your organization
            </h4>
            <p className="text-sm">
              This allows access to advanced AI-powered functionality including
              natural language filtering and other intelligent features.
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
                <LockIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted" />
              </span>
            )}
          </div>
        </div>
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
              AI features for your organization. This setting controls access to
              advanced AI-powered functionality including natural language
              filtering and intelligent data processing.
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
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
