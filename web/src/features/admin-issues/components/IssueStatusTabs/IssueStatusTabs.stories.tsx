import preview from "../../../../../.storybook/preview";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { IssueStatusTabs } from "./IssueStatusTabs";

const meta = preview.meta({ component: IssueStatusTabs });

export const Default = meta.story({
  render: () => (
    <Tabs defaultValue="open">
      <IssueStatusTabs />
    </Tabs>
  ),
});
