import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { AgentProfileWorkspace } from "./AgentProfileWorkspace";

function WorkspaceDemo(args: ComponentProps<typeof AgentProfileWorkspace>) {
  const [detailsOpen, setDetailsOpen] = useState(args.detailsOpen);
  return (
    <div className="h-[36rem]">
      <AgentProfileWorkspace
        {...args}
        detailsOpen={detailsOpen}
        onDetailsOpenChange={(open) => {
          setDetailsOpen(open);
          args.onDetailsOpenChange(open);
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  component: AgentProfileWorkspace,
  render: WorkspaceDemo,
  parameters: {
    layout: "fullscreen",
    viewport: {
      options: {
        "agent-workspace-desktop": {
          name: "Desktop",
          styles: { width: "1280px", height: "800px" },
        },
        "agent-workspace-phone": {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
});

const args = {
  navigation: (
    <span className="text-sm font-bold">Sessions · Tools · Skills</span>
  ),
  status: <Badge color="filled" text="Complete comparison" />,
  details: (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 16 }, (_, index) => (
        <section key={index} className="rounded-md border p-3">
          <h3 className="text-sm font-bold">Comparison evidence {index + 1}</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Review recent sessions alongside the historical baseline. Detailed
            context remains available while the session data keeps its height.
          </p>
        </section>
      ))}
    </div>
  ),
  detailsOpen: false,
  onDetailsOpenChange: fn(),
  children: (
    <Table
      tableName="Agent sessions"
      columns={[
        createTextTableColumn<{ session: string }>({
          accessorKey: "session",
          header: "Session",
        }),
      ]}
      data={{
        status: "success",
        data: Array.from({ length: 24 }, (_, index) => ({
          session: `Session ${index + 1}`,
        })),
      }}
      rowHeight="s"
    />
  ),
} satisfies ComponentProps<typeof AgentProfileWorkspace>;

export const Default = meta.story({ args });

export const DetailsOpen = meta.story({
  args: { ...args, detailsOpen: true },
});

export const NarrowDetailsOpen = meta.story({
  args: { ...args, detailsOpen: true },
  globals: { viewport: { value: "agent-workspace-phone", isRotated: false } },
});

export const DataKeepsItsHeight = meta.story({
  name: "(Test) Data keeps its height with long details",
  args: { ...args, onDetailsOpenChange: fn() },
  globals: { viewport: { value: "agent-workspace-desktop", isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByRole("region", { name: "Agent workspace" });
    const data = canvas.getByRole("region", { name: "Agent data" });
    const trigger = canvas.getByRole("button", { name: "Agent details" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(args.onDetailsOpenChange).toHaveBeenCalledWith(true);
    const details = canvas.getByRole("complementary", {
      name: "Agent details",
    });
    const content = within(details).getByRole("region", {
      name: "Agent detail content",
    });
    await waitFor(() => {
      expect(data.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        frame.getBoundingClientRect().height * 0.75,
      );
      expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    });
    const initialDataTop = data.getBoundingClientRect().top;
    content.scrollTop = content.scrollHeight;
    await waitFor(() => expect(content.scrollTop).toBeGreaterThan(0));
    await expect(data.getBoundingClientRect().top).toBe(initialDataTop);
    await expect(
      canvas.getByRole("table", { name: "Agent sessions" }),
    ).toBeVisible();
    await userEvent.click(
      within(details).getByRole("button", { name: "Close agent details" }),
    );
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveFocus();
    await expect(args.onDetailsOpenChange).toHaveBeenLastCalledWith(false);
  },
});

export const NarrowDisclosure = meta.story({
  name: "(Test) Narrow details replaces the body until closed",
  args: { ...args, onDetailsOpenChange: fn() },
  globals: { viewport: { value: "agent-workspace-phone", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const data = canvas.getByRole("region", { name: "Agent data" });
    await expect(data).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Agent details" }),
    );
    await expect(data).not.toBeVisible();
    const details = canvas.getByRole("complementary", {
      name: "Agent details",
    });
    await expect(details).toBeVisible();
    await userEvent.click(
      within(details).getByRole("button", { name: "Close agent details" }),
    );
    await expect(data).toBeVisible();
    await expect(
      canvas.getByRole("table", { name: "Agent sessions" }),
    ).toBeVisible();
  },
});
