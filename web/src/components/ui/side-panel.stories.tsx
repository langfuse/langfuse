import preview from "../../../.storybook/preview";
import { SidePanel, SidePanelContent, SidePanelHeader } from "./side-panel";

const meta = preview.meta({ component: SidePanel });

export const SetupSidebar = meta.story({
  render: () => (
    <div className="flex h-[480px] justify-end border">
      <SidePanel
        id="setup-sidebar-story"
        mobileTitle="Queue setup"
        variant="sidebar"
        scrollable={false}
      >
        <SidePanelHeader>
          <span className="text-sm font-bold">Queue setup</span>
        </SidePanelHeader>
        <SidePanelContent className="p-3">
          <p className="text-sm">Queue setup content</p>
        </SidePanelContent>
      </SidePanel>
    </div>
  ),
});
