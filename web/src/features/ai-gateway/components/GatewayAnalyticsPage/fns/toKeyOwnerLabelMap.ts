import { toLabelMap } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/toLabelMap";
import type { RouterOutputs } from "@/src/utils/api";

/**
 * Maps key IDs to who the traffic is attributed to: the bound owner for a
 * user-tied key, the key itself for a service key. All keys of one owner get
 * the same label, so their rows add up into one series.
 */
export function toKeyOwnerLabelMap(
  keys: readonly KeyEntry[],
): ReadonlyMap<string, string> {
  const groups = new Map<string, LabelEntry>();
  for (const key of keys) {
    const group = key.owner ?? key;
    if (!groups.has(group.id)) groups.set(group.id, group);
  }
  const groupLabels = toLabelMap([...groups.values()]);

  return new Map(
    keys.map((key) => {
      const groupId = key.owner?.id ?? key.id;
      return [key.id, groupLabels.get(groupId) ?? groupId];
    }),
  );
}

type KeyEntry =
  RouterOutputs["aiGateway"]["getAnalyticsLabels"]["apiKeys"][number];
type LabelEntry = Parameters<typeof toLabelMap>[0][number];
