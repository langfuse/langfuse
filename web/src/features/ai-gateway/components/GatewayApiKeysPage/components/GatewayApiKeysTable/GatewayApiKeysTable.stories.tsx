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
    metadata: { environment: "production", region: "eu" },
    apiKey: {
      id: "gateway-key-production",
      publicKey: "pk-lf-gw-...4fa2",
      displaySecretKey: "sk-lf-gw-...91bc",
      note: "Production application",
      createdAt: new Date("2026-09-04T12:00:00.000Z"),
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
  },
})) satisfies Extract<
  ComponentProps<typeof GatewayApiKeysTable>["data"],
  { status: "success" }
>["data"];

const actions = {
  createAction: onCreate,
  onRevoke,
  pagination: {
    mode: "cursor",
    state: { pageIndex: 0, pageSize: 50 },
    pageSizeOptions: [50],
    hasNextPage: false,
    onChange: onPageChange,
  },
} satisfies Pick<
  ComponentProps<typeof GatewayApiKeysTable>,
  "createAction" | "onRevoke" | "pagination"
>;

export const PopulatedMetadata = meta.story({
  name: "(Test) Populated metadata excludes key data from recordings",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
  },
  play: async ({ canvas }) => {
    const cells = canvas.getAllByRole("row")[1]!.querySelectorAll("td");
    await expect(cells[1]).toHaveClass("ph-no-capture");
    await expect(cells[3]).toHaveClass("ph-no-capture");
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
      .querySelectorAll("td")[3]!;
    await waitFor(() => {
      expect(metadataCell).toHaveTextContent(/\+\d+/);
    });
    const overflow = metadataCell.querySelector("[tabindex='0']")!;
    await userEvent.hover(overflow);
    const tooltip = await screen.findByRole("tooltip");
    await expect(tooltip.firstElementChild).toHaveClass("ph-no-capture");
  },
});

export const ManyRowsWithMoreAvailable = meta.story({
  args: {
    data: { status: "success", data: manyApiKeys },
    ...actions,
    pagination: { ...actions.pagination, hasNextPage: true },
  },
});

export const Empty = meta.story({
  args: {
    data: { status: "success", data: [] },
    ...actions,
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

export const MoreAvailable = meta.story({
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    pagination: { ...actions.pagination, hasNextPage: true },
  },
});

export const LoadingMore = meta.story({
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    pagination: {
      ...actions.pagination,
      hasNextPage: true,
      isLoadingNextPage: true,
    },
  },
});

export const NextPage = meta.story({
  name: "(Test) Next page",
  args: {
    data: { status: "success", data: apiKeys },
    ...actions,
    pagination: { ...actions.pagination, hasNextPage: true },
  },
  play: async ({ canvas }) => {
    onPageChange.mockClear();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(onPageChange).toHaveBeenCalledWith({
      pageIndex: 1,
      pageSize: 50,
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
