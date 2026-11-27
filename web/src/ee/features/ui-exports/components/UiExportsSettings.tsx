import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useUiExportsSetting } from "@/src/ee/features/ui-exports/hooks/useUiExportsSetting";

export function UiExportsSettings(props: { orgId: string }) {
  const setting = useUiExportsSetting(props.orgId);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h4 id="ui-exports-allowed-label" className="font-bold">
          <label
            htmlFor="ui-exports-allowed"
            className={setting.locked ? "cursor-not-allowed" : "cursor-pointer"}
          >
            UI data exports
          </label>
        </h4>
        <p
          id="ui-exports-allowed-description"
          className="text-muted-foreground text-sm"
        >
          {setting.description}
        </p>
      </div>
      <Switch
        id="ui-exports-allowed"
        checked={setting.exportsAllowed}
        disabled={setting.locked}
        aria-labelledby="ui-exports-allowed-label"
        aria-describedby="ui-exports-allowed-description"
        onCheckedChange={(allowed) => {
          setting.setDisabled(!allowed).catch(() => undefined);
        }}
      />
    </div>
  );
}
