import type { Flags } from "@/src/features/feature-flags/types";
import { parseFlags } from "@/src/features/feature-flags/utils";

export const testFeatureFlags = (overrides: Partial<Flags> = {}): Flags => ({
  ...parseFlags(["templateFlag"], { v4BetaEnabled: false }),
  ...overrides,
});
