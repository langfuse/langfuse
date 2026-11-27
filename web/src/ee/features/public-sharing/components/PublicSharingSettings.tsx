import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { usePublicSharingSetting } from "@/src/ee/features/public-sharing/hooks/usePublicSharingSetting";

export function PublicSharingSettings(props: { orgId: string }) {
  const setting = usePublicSharingSetting(props.orgId);

  return (
    <ConfirmationDialogController
      title="Allow public sharing?"
      text="Every trace and session that was shared before becomes viewable by anyone with its link again. This includes traces marked public by an SDK while sharing was off."
      confirmLabel="Allow public sharing"
      variant="default"
      onConfirm={() => setting.setDisabled(false)}
    >
      {({ openDialog }) => (
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h4 id="public-sharing-allowed-label" className="font-bold">
              <label
                htmlFor="public-sharing-allowed"
                className={
                  setting.locked ? "cursor-not-allowed" : "cursor-pointer"
                }
              >
                Public sharing
              </label>
            </h4>
            <p
              id="public-sharing-allowed-description"
              className="text-muted-foreground text-sm"
            >
              {setting.description}
            </p>
          </div>
          <Switch
            id="public-sharing-allowed"
            checked={setting.sharingAllowed}
            disabled={setting.locked}
            aria-labelledby="public-sharing-allowed-label"
            aria-describedby="public-sharing-allowed-description"
            onCheckedChange={(allowed) => {
              if (allowed) {
                openDialog();
              } else {
                setting.setDisabled(true).catch(() => undefined);
              }
            }}
          />
        </div>
      )}
    </ConfirmationDialogController>
  );
}
