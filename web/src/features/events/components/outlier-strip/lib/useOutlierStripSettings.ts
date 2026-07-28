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
    mode: z.enum(["cost", "latency", "tokens", "split"]).catch("cost"),
    latencyAgg: z.enum(["max", "p95", "avg"]).catch("max"),
    costAgg: z.enum(["max", "sum"]).catch("max"),
  })
  .catch({ mode: "cost", latencyAgg: "max", costAgg: "max" });

export type OutlierStripSettings = z.infer<typeof outlierStripSettingsSchema>;

export function useOutlierStripSettings(): {
  settings: OutlierStripSettings;
  update: (patch: Partial<OutlierStripSettings>) => void;
} {
  const [raw, setRaw] = useLocalStorage<unknown>(
    "events-pulse-chart-settings",
    {},
  );
  const settings = useMemo(
    () => outlierStripSettingsSchema.parse(raw ?? {}),
    [raw],
  );
  return {
    settings,
    update: (patch) => setRaw({ ...settings, ...patch }),
  };
}
