import { useId, useState } from "react";
import { useSession } from "next-auth/react";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
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
import { Label } from "@/src/components/ui/label";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

type V4MigrationWizardToggleSource = "panel" | "settings";

export function V4MigrationWizardToggle({
  source,
}: {
  source: V4MigrationWizardToggleSource;
}) {
  const { data: session, update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
  const toggleId = useId();
  const confirmationId = useId();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const enabled = session?.user?.v4MigrationWizardEnabled !== false;

  const mutation = api.userAccount.setV4MigrationWizardEnabled.useMutation({
    onSuccess: async ({ v4MigrationWizardEnabled }) => {
      capture("v4_migration:wizard_toggled", {
        enabled: v4MigrationWizardEnabled,
        source,
      });
      await updateSession();
      setConfirmationOpen(false);
      setMigrationComplete(false);
    },
    onError: () => {
      showErrorToast("Could not update migration wizard", "Please try again.");
    },
  });

  const handleToggle = (nextEnabled: boolean) => {
    if (nextEnabled) {
      mutation.mutate({ enabled: true });
      return;
    }

    capture("v4_migration:wizard_disable_confirmation_opened", { source });
    setConfirmationOpen(true);
  };

  const cancelDisable = () => {
    capture("v4_migration:wizard_disable_confirmation_cancelled", { source });
    setConfirmationOpen(false);
    setMigrationComplete(false);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor={toggleId}
            className="cursor-pointer text-sm font-bold"
          >
            Show migration wizard
          </Label>
          <p className="text-muted-foreground text-sm">
            Show migration guidance and action reminders across Langfuse.
          </p>
        </div>
        <Switch
          id={toggleId}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={mutation.isPending}
          aria-label="Show migration wizard"
        />
      </div>

      <AlertDialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          setConfirmationOpen(open);
          if (!open) setMigrationComplete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off the migration wizard?</AlertDialogTitle>
            <AlertDialogDescription>
              Only turn it off after you have completed the v4 migration. You
              can turn the wizard back on anytime in Account settings → v4
              Migration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox
              id={confirmationId}
              checked={migrationComplete}
              onCheckedChange={(checked) =>
                setMigrationComplete(checked === true)
              }
              aria-label="I confirm that the v4 migration is complete"
            />
            <Label
              htmlFor={confirmationId}
              className="cursor-pointer text-sm leading-4 font-normal"
            >
              I confirm that the v4 migration is complete.
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDisable}>
              Keep wizard on
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!migrationComplete || mutation.isPending}
              onClick={() => mutation.mutate({ enabled: false })}
            >
              Turn off wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
