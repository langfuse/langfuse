import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { type IoRenderMode } from "@/src/components/table/data-table-io-render-mode-switch";

export const ExperimentFormatSetting = ({
  ioRenderMode,
  onIoRenderModeChange,
}: {
  ioRenderMode: IoRenderMode;
  onIoRenderModeChange: (mode: IoRenderMode) => void;
}) => (
  <Tabs
    value={ioRenderMode}
    onValueChange={(value) => {
      if (value === "json" || value === "text") onIoRenderModeChange(value);
    }}
  >
    <Tabs.List size="sm" aria-label="Cell format">
      <Tabs.Trigger value="text" size="sm" label="Formatted" />
      <Tabs.Trigger value="json" size="sm" label="Raw" />
    </Tabs.List>
  </Tabs>
);
