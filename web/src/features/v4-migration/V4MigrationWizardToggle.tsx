import { useId, useState } from "react";
import { useSession } from "next-auth/react";
import { SparklesIcon } from "lucide-react";

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
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { api } from "@/src/utils/api";

type V4MigrationWizardToggleSource = "panel" | "settings" | "sidebar";

const WIZARD_TOGGLE_LABEL = "Show migration wizard";
const WIZARD_TOGGLE_DESCRIPTION =
  "Show migration guidance and action reminders across Langfuse.";

function useV4MigrationWizardToggle(source: V4MigrationWizardToggleSource) {
  const { data: session, update: updateSession } = useSession();
  const capture = usePostHogClientCapture();
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

  const closeConfirmation = (open: boolean) => {
    setConfirmationOpen(open);
    if (!open) setMigrationComplete(false);
  };

  return {
    enabled,
    handleToggle,
    confirmationOpen,
    closeConfirmation,
    migrationComplete,
    setMigrationComplete,
    cancelDisable,
    mutation,
  };
}

function V4MigrationWizardDisableDialog({
  confirmationOpen,
  closeConfirmation,
  migrationComplete,
  setMigrationComplete,
  cancelDisable,
  mutation,
}: {
  confirmationOpen: boolean;
  closeConfirmation: (open: boolean) => void;
  migrationComplete: boolean;
  setMigrationComplete: (value: boolean) => void;
  cancelDisable: () => void;
  mutation: {
    isPending: boolean;
    mutate: (input: { enabled: boolean }) => void;
  };
}) {
  const confirmationId = useId();

  return (
    <AlertDialog open={confirmationOpen} onOpenChange={closeConfirmation}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn off the migration wizard?</AlertDialogTitle>
          <AlertDialogDescription>
            Only turn it off after you have completed the v4 migration. You can
            turn the wizard back on anytime from the sidebar or in Account
            settings → v4 Migration.
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
  );
}

export function V4MigrationWizardToggle({
  source,
}: {
  source: Exclude<V4MigrationWizardToggleSource, "sidebar">;
}) {
  const toggleId = useId();
  const {
    enabled,
    handleToggle,
    confirmationOpen,
    closeConfirmation,
    migrationComplete,
    setMigrationComplete,
    cancelDisable,
    mutation,
  } = useV4MigrationWizardToggle(source);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Label
            htmlFor={toggleId}
            className="cursor-pointer text-sm font-bold"
          >
            {WIZARD_TOGGLE_LABEL}
          </Label>
          <p className="text-muted-foreground text-sm">
            {WIZARD_TOGGLE_DESCRIPTION}
          </p>
        </div>
        <Switch
          id={toggleId}
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={mutation.isPending}
          aria-label={WIZARD_TOGGLE_LABEL}
        />
      </div>

      <V4MigrationWizardDisableDialog
        confirmationOpen={confirmationOpen}
        closeConfirmation={closeConfirmation}
        migrationComplete={migrationComplete}
        setMigrationComplete={setMigrationComplete}
        cancelDisable={cancelDisable}
        mutation={mutation}
      />
    </>
  );
}

export function V4MigrationWizardSidebarToggle() {
  const v4UpgradeUiAvailable = useV4UpgradeUiFlag();
  const toggleId = useId();
  const descriptionId = useId();
  const {
    enabled,
    handleToggle,
    confirmationOpen,
    closeConfirmation,
    migrationComplete,
    setMigrationComplete,
    cancelDisable,
    mutation,
  } = useV4MigrationWizardToggle("sidebar");

  if (!v4UpgradeUiAvailable) {
    return null;
  }

  return (
    <>
      <SidebarMenuButton
        asChild
        className="justify-between gap-1.5 group-data-[collapsible=icon]:justify-center"
      >
        <div>
          <div className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <SparklesIcon className="h-4 w-4 shrink-0" />
            <Label
              htmlFor={toggleId}
              className="block min-w-0 flex-1 cursor-pointer truncate text-sm font-normal"
              title={WIZARD_TOGGLE_LABEL}
            >
              {WIZARD_TOGGLE_LABEL}
            </Label>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex shrink-0">
                <Switch
                  id={toggleId}
                  size="sm"
                  checked={enabled}
                  onCheckedChange={handleToggle}
                  disabled={mutation.isPending}
                  aria-label={WIZARD_TOGGLE_LABEL}
                  aria-describedby={descriptionId}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs">
              {WIZARD_TOGGLE_DESCRIPTION}
            </TooltipContent>
          </Tooltip>
          <span id={descriptionId} className="sr-only">
            {WIZARD_TOGGLE_DESCRIPTION}
          </span>
        </div>
      </SidebarMenuButton>

      <V4MigrationWizardDisableDialog
        confirmationOpen={confirmationOpen}
        closeConfirmation={closeConfirmation}
        migrationComplete={migrationComplete}
        setMigrationComplete={setMigrationComplete}
        cancelDisable={cancelDisable}
        mutation={mutation}
      />
    </>
  );
}
