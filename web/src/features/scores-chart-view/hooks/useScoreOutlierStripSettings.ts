import { useMemo } from "react";
import { z } from "zod";
import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * The strip's per-user chart settings as ONE zod-validated localStorage
 * object — mirrors the observations strip's `useOutlierStripSettings`.
 * localStorage is user-editable and cross-tab-writable; validating at a
 * single seam makes a corrupted or legacy value structurally incapable of
 * crashing the page.
 */
const scoreOutlierStripSettingsSchema = z
  .object({
    mode: z.enum(["count", "value"]).catch("count"),
    valueAgg: z.enum(["avg", "min", "max"]).catch("avg"),
  })
  .catch({ mode: "count", valueAgg: "avg" });

export type ScoreOutlierStripSettings = z.infer<
  typeof scoreOutlierStripSettingsSchema
>;

export function useScoreOutlierStripSettings(): {
  settings: ScoreOutlierStripSettings;
  update: (patch: Partial<ScoreOutlierStripSettings>) => void;
} {
  const [raw, setRaw] = useLocalStorage<unknown>(
    "scores-pulse-chart-settings",
    {},
  );
  const settings = useMemo(
    () => scoreOutlierStripSettingsSchema.parse(raw ?? {}),
    [raw],
  );
  return {
    settings,
    update: (patch) => setRaw({ ...settings, ...patch }),
  };
}
