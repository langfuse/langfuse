import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { useUiExportsSetting } from "@/src/ee/features/ui-exports/hooks/useUiExportsSetting";

export function UiExportsSettings(props: { orgId: string }) {
  const setting = useUiExportsSetting(props.orgId);

  return (
    <SwitchInput
      id="ui-exports-allowed"
      variant="plain"
      title="UI data exports"
      description={setting.description}
      checked={setting.exportsAllowed}
      disabled={setting.locked}
      onCheckedChange={(allowed) => {
        setting.setDisabled(!allowed).catch(() => undefined);
      }}
    />
  );
}
