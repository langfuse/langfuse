import type { Flags } from "@/src/release-management/feature-flags/types";
import { parseFlags } from "@/src/release-management/feature-flags/utils";

export const testFeatureFlags = (overrides: Partial<Flags> = {}): Flags => ({
  ...parseFlags(["templateFlag"], { email: null, v4BetaEnabled: false }),
  ...overrides,
});
