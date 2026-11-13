import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import { TopicsHeaderActions } from "./TopicsHeaderActions";
import {
  prepareTopicsActions,
  refreshMapDisabledReason,
} from "./prepare-topics-actions";

const defaultArgs: ComponentProps<typeof TopicsHeaderActions> = {
  actions: prepareTopicsActions({
    automaticProcessing: { state: { status: "off" }, saving: false },
    configureAvailable: true,
    canWrite: true,
    menuOnly: false,
    onConfigure: fn(),
    onHistory: fn(),
    onNewMap: fn(),
    onNewSnapshot: fn(),
    onEditRun: fn(),
    showUnassigned: true,
    onShowUnassignedChange: fn(),
  }),
};

const meta = preview.meta({
  component: TopicsHeaderActions,
  parameters: { layout: "fullscreen" },
  args: defaultArgs,
});

export const Wide = meta.story({
  render: (args) => (
    <div className="@container/topics-header w-full p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
});

export const Compact = meta.story({
  name: "(Test) Compact header keeps Edit map, New map and New snapshot",
  render: (args) => (
    <div className="@container/topics-header w-80 p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Edit map" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Topics actions" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByRole("menuitem", { name: "New map" })).toBeVisible(),
    );
    await expect(
      body.getByRole("menuitem", { name: "New snapshot" }),
    ).toBeVisible();
  },
});

const now = Date.parse("2026-11-13T12:00:00.000Z");

export const RefreshCooldown = meta.story({
  name: "(Test) Refresh map waits out its cooldown",
  args: {
    actions: prepareTopicsActions({
      automaticProcessing: { state: { status: "on" }, saving: false },
      configureAvailable: true,
      canWrite: true,
      menuOnly: false,
      onConfigure: fn(),
      onHistory: fn(),
      onNewMap: fn(),
      onNewSnapshot: fn(),
      onEditRun: fn(),
      refreshMap: {
        onSelect: fn(),
        disabledReason: refreshMapDisabledReason({
          canWrite: true,
          state: { status: "on" },
          rule: {
            enabled: true,
            refresh: {
              availableAt: new Date(now + 10 * 60_000).toISOString(),
              running: false,
            },
          },
          setupActive: false,
          now,
        }),
      },
      showUnassigned: true,
      onShowUnassignedChange: fn(),
    }),
  },
  render: (args) => (
    <div className="@container/topics-header w-full p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Topics actions" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const item = await waitFor(() =>
      body.getByRole("menuitem", { name: /Refresh map/ }),
    );
    await expect(item).toHaveAttribute("aria-disabled", "true");
    await expect(item).toHaveAttribute(
      "title",
      "Refreshed recently. Available again in 10 min.",
    );
  },
});
