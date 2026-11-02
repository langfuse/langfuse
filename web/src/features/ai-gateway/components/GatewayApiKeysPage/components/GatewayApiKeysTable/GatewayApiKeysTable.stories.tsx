/* eslint-disable @repo/storybook-play-no-implementation-detail-assertions */
import type { ComponentProps } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayApiKeysTable } from "./GatewayApiKeysTable";

const meta = preview.meta({ component: GatewayApiKeysTable });

const onCreate = fn();
const onRevoke = fn();
const onPageChange = fn();

const apiKeys = [
  {
    metadata: { user: "Marc Klingen", environment: "production" },
    apiKey: {
      id: "gateway-key-production",
      publicKey: "pk-lf-gw-...4fa2",
      displaySecretKey: "sk-lf-gw-...91bc",
      note: "Production application",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
      expiresAt: new Date("2027-09-04T23:59:59.999Z"),
      user: { name: "Marc Klingen", email: "marc@example.com", image: null },
    },
  },
] satisfies Extract<
  ComponentProps<typeof GatewayApiKeysTable>["data"],
  { status: "success" }
>["data"];

const manyApiKeys = Array.from({ length: 30 }, (_, index) => ({
  metadata: {
    environment: index % 2 === 0 ? "production" : "staging",
    region: index % 3 === 0 ? "us" : "eu",
  },
  apiKey: {
    id: `gateway-key-${index + 1}`,
    publicKey: `pk-lf-gw-${String(index + 1).padStart(4, "0")}`,
    displaySecretKey: `sk-lf-gw-...${String(index + 1).padStart(4, "0")}`,
    note: `Application ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 8, 4 - (index % 28))),
    expiresAt: null,
    user:
      index % 5 === 0
        ? null
        : { name: `Member ${index + 1}`, email: null, image: null },
  },
})) satisfies Extract<
  ComponentProps<typeof GatewayApiKeysTable>["data"],
  { status: "success" }
>["data"];

const actions = {
  lastUsed: { status: "success", isTracked: true },
  createAction: onCreate,
  usageInstructionsAction: fn(),
  onRevoke,
  pagination: {
    mode: "offset",
    totalCount: 1,
    state: { pageIndex: 0, pageSize: 10 },
    onChange: onPageChange,
  },
  search: { value: "", onChange: fn() },
} satisfies Pick<
  ComponentProps<typeof GatewayApiKeysTable>,
  | "lastUsed"
  | "createAction"
  | "usageInstructionsAction"
  | "onRevoke"
  | "pagination"
  | "search"
>;

const lastUsedCell = (canvas: {
  getAllByRole: (role: "row") => HTMLElement[];
}) => canvas.getAllByRole("row")[1]!.querySelectorAll("td")[5]!;

export const LastUsedLoading = meta.story({
  name: "(Test) Last used shows a skeleton while loading",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    lastUsed: { status: "loading" },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Production application")).toBeVisible();
    await expect(
      lastUsedCell(canvas).querySelector("[data-slot='skeleton']"),
    ).not.toBeNull();
  },
});

export const LastUsedRecently = meta.story({
  name: "(Test) Last used shows relative time with the full timestamp",
  args: {
    data: {
      status: "success",
      data: [
        {
          ...apiKeys[0]!,
          lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      ],
    },
    ...actions,
  },
  play: async ({ canvas }) => {
    const timestamp = lastUsedCell(canvas).querySelector("[title]")!;
    await expect(timestamp).toHaveTextContent(/^2 hours ago$/);
    await expect(timestamp.getAttribute("title")).toMatch(/\d{4}-\d{2}-\d{2}/);
  },
});

export const LastUsedNotInWindow = meta.story({
  name: "(Test) Last used reports keys without recent traffic",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
  },
  play: async ({ canvas }) => {
    await expect(lastUsedCell(canvas)).toHaveTextContent("Not used (7d)");
  },
});

export const LastUsedUntracked = meta.story({
  name: "(Test) Last used is unavailable without gateway traffic storage",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    lastUsed: { status: "success", isTracked: false },
  },
  play: async ({ canvas }) => {
    await expect(lastUsedCell(canvas)).toHaveTextContent("Unavailable");
  },
});

export const PopulatedMetadata = meta.story({
  name: "(Test) Populated metadata excludes key data from recordings",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
  },
  play: async ({ canvas }) => {
    const cells = canvas.getAllByRole("row")[1]!.querySelectorAll("td");
    await expect(cells[1]).toHaveClass("ph-no-capture");
    await expect(cells[6]).toHaveClass("ph-no-capture");
  },
});

export const OverflowingMetadata = meta.story({
  name: "(Test) Metadata badges collapse when the cell is narrow",
  args: {
    data: {
      status: "success",
      data: [
        {
          ...apiKeys[0]!,
          metadata: {
            environment: "production",
            region: "eu",
            team: "platform",
            service: "gateway",
          },
        },
      ],
    },
    ...actions,
  },
  render: (args) => (
    <div className="w-[420px]">
      <GatewayApiKeysTable {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const metadataCell = canvas
      .getAllByRole("row")[1]!
      .querySelectorAll("td")[6]!;
    await waitFor(() => {
      expect(metadataCell).toHaveTextContent(/\+\d+/);
    });
    const overflow = metadataCell.querySelector("[tabindex='0']")!;
    await userEvent.hover(overflow);
    const tooltip = await screen.findByRole("tooltip");
    await expect(tooltip.firstElementChild).toHaveClass("ph-no-capture");
  },
});

export const ManyRows = meta.story({
  args: {
    data: { status: "success", data: manyApiKeys },
    ...actions,
    pagination: {
      ...actions.pagination,
      totalCount: 75,
      state: { pageIndex: 0, pageSize: 30 },
    },
  },
});

export const Empty = meta.story({
  args: {
    data: { status: "success", data: [] },
    ...actions,
    pagination: { ...actions.pagination, totalCount: 0 },
  },
});

export const Loading = meta.story({
  args: {
    data: { status: "loading" },
    ...actions,
  },
});

export const MissingDescription = meta.story({
  name: "(Test) Missing description shows empty marker",
  args: {
    data: {
      status: "success",
      data: [{ ...apiKeys[0]!, apiKey: { ...apiKeys[0]!.apiKey, note: null } }],
    },
    ...actions,
  },
  play: async ({ canvas }) => {
    const row = canvas.getAllByRole("row")[1]!;
    await expect(row.querySelectorAll("td")[2]).toHaveTextContent(/^\s*-\s*$/);
  },
});

export const NextPage = meta.story({
  name: "(Test) Next page",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    pagination: { ...actions.pagination, totalCount: 25 },
  },
  play: async ({ canvas }) => {
    onPageChange.mockClear();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(onPageChange).toHaveBeenCalledWith({
      pageIndex: 1,
      pageSize: 10,
    });
  },
});

export const CreatesKey = meta.story({
  name: "(Test) Creates key",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
  },
  play: async ({ canvas }) => {
    onCreate.mockClear();
    await userEvent.click(canvas.getByRole("button", { name: "Create key" }));
    await expect(onCreate).toHaveBeenCalledOnce();
  },
});
