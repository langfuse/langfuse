import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  CROSS_PROJECT_TRACE_CORRELATION_KEY_MAX_LENGTH,
  CROSS_PROJECT_TRACE_CORRELATION_KEY_PATTERN,
  DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY,
} from "@/src/features/trace-correlation/constants";
import { api } from "@/src/utils/api";
import { LockIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

export default function CrossProjectTraceTrackingSwitch() {
  const { update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const [isEnabled, setIsEnabled] = useState(
    organization?.crossProjectTraceTrackingEnabled ?? false,
  );
  const savedCorrelationKey =
    organization?.crossProjectTraceCorrelationKey ??
    DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY;
  const [correlationKey, setCorrelationKey] = useState(savedCorrelationKey);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });
  const isCorrelationKeyValid = useMemo(() => {
    const trimmedKey = correlationKey.trim();
    return (
      trimmedKey.length > 0 &&
      trimmedKey.length <= CROSS_PROJECT_TRACE_CORRELATION_KEY_MAX_LENGTH &&
      CROSS_PROJECT_TRACE_CORRELATION_KEY_PATTERN.test(trimmedKey)
    );
  }, [correlationKey]);
  const hasCorrelationKeyChanges =
    correlationKey.trim() !== savedCorrelationKey;

  useEffect(() => {
    setIsEnabled(organization?.crossProjectTraceTrackingEnabled ?? false);
    setCorrelationKey(savedCorrelationKey);
  }, [
    organization?.crossProjectTraceTrackingEnabled,
    savedCorrelationKey,
    organization?.id,
  ]);

  const updateCrossProjectTraceTracking = api.organizations.update.useMutation({
    onSuccess: async () => {
      await updateSession();
      setConfirmOpen(false);
    },
    onError: () => {
      setConfirmOpen(false);
    },
  });

  function handleSwitchChange(newValue: boolean) {
    if (!hasAccess) return;
    setIsEnabled(newValue);
    setConfirmOpen(true);
  }

  function handleCancel() {
    setIsEnabled(organization?.crossProjectTraceTrackingEnabled ?? false);
    setConfirmOpen(false);
  }

  function handleConfirm() {
    if (!organization || !hasAccess) return;
    capture("organization_settings:cross_project_trace_tracking_toggle");
    updateCrossProjectTraceTracking.mutate({
      orgId: organization.id,
      crossProjectTraceTrackingEnabled: isEnabled,
    });
  }

  function handleSaveCorrelationKey() {
    if (!organization || !hasAccess || !isCorrelationKeyValid) return;
    capture("organization_settings:cross_project_trace_correlation_key_update");
    updateCrossProjectTraceTracking.mutate({
      orgId: organization.id,
      crossProjectTraceCorrelationKey: correlationKey.trim(),
    });
  }

  return (
    <div>
      <Header title="Tracing" />
      <Card className="mb-4 p-3">
        <div className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h4 className="font-semibold">Enable cross-project trace links</h4>
            <p className="text-muted-foreground text-sm">
              Users can discover related traces with the same metadata
              correlation value across projects in this organization. Results
              only include projects the user can already read and are shown as
              navigation links.
            </p>
          </div>
          <div className="relative">
            <Switch
              checked={isEnabled}
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
        <div className="mt-4 border-t pt-3">
          <label
            htmlFor="cross-project-trace-correlation-key"
            className="text-sm font-medium"
          >
            Correlation metadata key
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="cross-project-trace-correlation-key"
              value={correlationKey}
              disabled={!hasAccess}
              onChange={(event) => setCorrelationKey(event.target.value)}
              placeholder={DEFAULT_CROSS_PROJECT_TRACE_CORRELATION_KEY}
              className="sm:max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              disabled={
                !hasAccess ||
                !hasCorrelationKeyChanges ||
                !isCorrelationKeyValid ||
                updateCrossProjectTraceTracking.isPending
              }
              loading={updateCrossProjectTraceTracking.isPending}
              onClick={handleSaveCorrelationKey}
            >
              Save
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Related traces match on{" "}
            <span className="font-mono">metadata.{savedCorrelationKey}</span>.
          </p>
          {!isCorrelationKeyValid ? (
            <p className="text-destructive mt-1 text-xs">
              Use 1-{CROSS_PROJECT_TRACE_CORRELATION_KEY_MAX_LENGTH} characters:
              letters, numbers, underscore, dollar sign, dot, or dash.
            </p>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && !updateCrossProjectTraceTracking.isPending) {
            handleCancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm tracing setting change</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              You are about to{" "}
              <strong>{isEnabled ? "enable" : "disable"}</strong> cross-project
              trace links for this organization.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              This does not merge trace graphs or grant access to additional
              projects. Traces are matched by the configured metadata
              correlation key.
            </p>
          </DialogBody>
          <DialogFooter>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                disabled={updateCrossProjectTraceTracking.isPending}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleConfirm}
                loading={updateCrossProjectTraceTracking.isPending}
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
