import type { ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { GatewayApiKeysView } from "../GatewayApiKeysView";

const meta = preview.meta({ component: GatewayApiKeysView });

const onCreate = fn();
const onRevoke = fn();

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
} satisfies Pick<
  ComponentProps<typeof GatewayApiKeysView>,
  "createAction" | "renderRevokeAction"
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
