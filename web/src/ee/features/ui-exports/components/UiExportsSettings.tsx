import Header from "@/src/components/layouts/header";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { useUiExportsSetting } from "@/src/ee/features/ui-exports/hooks/useUiExportsSetting";

export function UiExportsSettings(props: { orgId: string }) {
  const setting = useUiExportsSetting(props.orgId);

  return (
    <div>
      <Header title="UI data exports" />
      <SwitchInput
        id="ui-exports-allowed"
        description={setting.description}
        checked={setting.exportsAllowed}
        disabled={setting.locked}
        onCheckedChange={(allowed) => {
          setting.setDisabled(!allowed).catch(() => undefined);
        }}
      />
    </div>
  );
}
