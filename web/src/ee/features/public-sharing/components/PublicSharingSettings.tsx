import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
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
        <SwitchInput
          id="public-sharing-allowed"
          variant="plain"
          title="Public sharing"
          description={setting.description}
          checked={setting.sharingAllowed}
          disabled={setting.locked}
          onCheckedChange={(allowed) => {
            if (allowed) {
              openDialog();
            } else {
              setting.setDisabled(true).catch(() => undefined);
            }
          }}
        />
      )}
    </ConfirmationDialogController>
  );
}
