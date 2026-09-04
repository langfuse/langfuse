import type { ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { expect, fn, userEvent } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayApiKeysView } from "./GatewayApiKeysView";

const meta = preview.meta({ component: GatewayApiKeysView });

const onCreate = fn();
const onRevoke = fn();
const onLoadMore = fn();

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
] satisfies ComponentProps<typeof GatewayApiKeysView>["apiKeys"];

const actions = {
  createAction: <Button onClick={onCreate}>Create gateway key</Button>,
  renderRevokeAction: (apiKeyId: string) => (
    <Button variant="ghost" onClick={() => onRevoke(apiKeyId)}>
      Revoke
    </Button>
  ),
  hasMore: false,
  isLoadingMore: false,
  onLoadMore,
} satisfies Pick<
  ComponentProps<typeof GatewayApiKeysView>,
  | "createAction"
  | "renderRevokeAction"
  | "hasMore"
  | "isLoadingMore"
  | "onLoadMore"
>;

export const PopulatedMetadata = meta.story({
  args: {
    apiKeys,
    ...actions,
  },
});

export const Empty = meta.story({
  args: {
    apiKeys: [],
    ...actions,
  },
});

export const MoreAvailable = meta.story({
  args: {
    apiKeys,
    ...actions,
    hasMore: true,
  },
});

export const LoadingMore = meta.story({
  args: {
    apiKeys,
    ...actions,
    hasMore: true,
    isLoadingMore: true,
  },
});

export const LoadsMore = meta.story({
  name: "(Test) Loads More",
  args: {
    apiKeys,
    ...actions,
    hasMore: true,
  },
  play: async ({ canvas }) => {
    onLoadMore.mockClear();
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(onLoadMore).toHaveBeenCalledOnce();
  },
});
