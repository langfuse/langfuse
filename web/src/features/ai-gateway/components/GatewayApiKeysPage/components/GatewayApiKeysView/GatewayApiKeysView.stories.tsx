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
})) satisfies ComponentProps<typeof GatewayApiKeysView>["apiKeys"];

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

export const ManyRowsWithMoreAvailable = meta.story({
  args: {
    apiKeys: manyApiKeys,
    ...actions,
    hasMore: true,
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
