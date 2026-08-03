import { useMemo } from "react";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * The strip's per-user chart settings as ONE zod-validated localStorage
 * object. localStorage is user-editable and cross-tab-writable; validating at
 * a single seam (instead of per-key ad-hoc sanitizers) makes corrupted or
 * legacy values structurally incapable of crashing the page — every field
 * independently falls back to its default via `.catch`.
 */
const outlierStripSettingsSchema = z
  .object({
    mode: z.enum(["count", "cost", "latency"]).catch("count"),
    latencyAgg: z.enum(["p95", "p50"]).catch("p95"),
    costAgg: z.enum(["sum"]).catch("sum"),
  })
  .catch({ mode: "count", latencyAgg: "p95", costAgg: "sum" });

export type OutlierStripSettings = z.infer<typeof outlierStripSettingsSchema>;

const OUTLIER_STRIP_SETTINGS_VERSION = 1;

export const parseOutlierStripSettings = (raw: unknown) => {
  const settings = outlierStripSettingsSchema.parse(raw ?? {});
  const isCurrentVersion = z
    .object({ version: z.literal(OUTLIER_STRIP_SETTINGS_VERSION) })
    .safeParse(raw).success;

  return isCurrentVersion ? settings : { ...settings, mode: "count" as const };
};

export function useOutlierStripSettings(): {
  settings: OutlierStripSettings;
  update: (patch: Partial<OutlierStripSettings>) => void;
} {
  const [raw, setRaw] = useLocalStorage<unknown>(
    "events-pulse-chart-settings",
    {},
  );
  const settings = useMemo(() => parseOutlierStripSettings(raw), [raw]);
  return {
    settings,
    update: (patch) =>
      setRaw({
        version: OUTLIER_STRIP_SETTINGS_VERSION,
        ...settings,
        ...patch,
      }),
  };
}
