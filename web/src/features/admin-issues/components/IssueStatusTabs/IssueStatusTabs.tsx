import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

export function IssueStatusTabs() {
  return (
    <Tabs.List
      variant="underline"
      layout="start"
      gap="lg"
      aria-label="Issue status"
    >
      <Tabs.Trigger value="open" variant="underline">
        Open
      </Tabs.Trigger>
      <Tabs.Trigger value="done" variant="underline">
        Done
      </Tabs.Trigger>
      <Tabs.Trigger value="ignored" variant="underline">
        Ignored
      </Tabs.Trigger>
    </Tabs.List>
  );
}
