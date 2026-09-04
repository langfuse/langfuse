import { useCallback, useMemo, useState } from "react";
import {
  type FilterState,
  type SingleValueOption,
  type TimeFilter,
} from "@langfuse/shared";

import { api, type RouterOutputs } from "@/src/utils/api";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";

/** metadataValueQueryOptions is the shared react-query config for each per-key metadata-value query. */
const metadataValueQueryOptions = {
  trpc: { context: { skipBatch: true } },
  staleTime: 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/** useMetadataValueOptions fetches observed values for every in-use metadata key into a key→options map. */
export const useMetadataValueOptions = ({
  projectId,
  filterState,
  startTimeFilter,
  enabled = true,
}: {
  projectId: string;
  filterState: FilterState;
  startTimeFilter?: TimeFilter[];
  enabled?: boolean;
}): {
  metadataValueOptions: Record<string, SingleValueOption[]>;
  onMetadataKeyChange: (key: string) => void;
} => {
  // A metadata row is not a committed filter until it also has a value, so its
  // key is absent from filterState while the user is still picking that value.
  // Track every key touched this session so each row keeps its suggestions.
  const [editedKeys, setEditedKeys] = useState<readonly string[]>([]);

  const onMetadataKeyChange = useCallback((key: string) => {
    setEditedKeys((prev) =>
      key && !prev.includes(key) ? [...prev, key] : prev,
    );
  }, []);

  const keys = useMemo(
    () => metadataKeysInUse(filterState, editedKeys),
    [filterState, editedKeys],
  );

  const combine = useCallback(
    (results: readonly MetadataValueResult[]) =>
      zipMetadataValueOptions(keys, results),
    [keys],
  );

  const metadataValueOptions = api.useQueries(
    (t) =>
      keys.map((key) =>
        t.events.metadataValues(
          { projectId, key, startTimeFilter },
          { ...metadataValueQueryOptions, enabled: enabled && Boolean(key) },
        ),
      ),
    { combine },
  );

  return { metadataValueOptions, onMetadataKeyChange };
};

/** metadataKeysInUse unions committed stringObject filter keys with keys edited this session. */
const metadataKeysInUse = (
  filterState: FilterState,
  editedKeys: readonly string[],
): string[] => {
  const keys = new Set<string>(editedKeys);
  for (const filter of filterState) {
    if (filter.type === "stringObject" && filter.key) keys.add(filter.key);
  }
  return [...keys];
};

/** zipMetadataValueOptions maps each key to its query result's normalized options, skipping unresolved keys. */
const zipMetadataValueOptions = (
  keys: string[],
  results: readonly MetadataValueResult[],
): Record<string, SingleValueOption[]> => {
  const map: Record<string, SingleValueOption[]> = {};
  results.forEach((result, i) => {
    const key = keys[i];
    if (key === undefined || !result.data) return;
    map[key] = normalizeSingleValueOptions(result.data);
  });
  return map;
};

/** MetadataValueResult is the per-key query slice zipMetadataValueOptions reads. */
type MetadataValueResult = {
  data: RouterOutputs["events"]["metadataValues"] | undefined;
};

export const __test = { zipMetadataValueOptions, metadataKeysInUse };
