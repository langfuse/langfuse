import {
  Ban,
  Building2,
  Eye,
  FolderGit2,
  Network,
  Radio,
  ShieldCheck,
  Star,
  User,
  type LucideIcon,
} from "lucide-react";

import { type SystemRole } from "@langfuse/shared/src/db";

/** ExpiryPreset is a selectable key-lifetime option; `custom` defers to a picked date. */
export type ExpiryPreset = "never" | "30d" | "60d" | "90d" | "1y" | "custom";

/** expiryPresetOptions lists the lifetime presets in display order; `days` is null when the choice carries no fixed offset. */
export const expiryPresetOptions: {
  value: ExpiryPreset;
  label: string;
  days: number | null;
}[] = [
  { value: "never", label: "No expiration", days: null },
  { value: "30d", label: "30 days", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "custom", label: "Custom date…", days: null },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** resolveExpiresAt turns an expiry preset (and a custom `yyyy-mm-dd` value) into an absolute date, or null when the key never expires. */
export const resolveExpiresAt = (
  preset: ExpiryPreset,
  customDate: string,
  now: Date = new Date(),
): Date | null => {
  if (preset === "custom") {
    if (!customDate) return null;
    const parsed = new Date(customDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const days =
    expiryPresetOptions.find((o) => o.value === preset)?.days ?? null;
  if (days === null) return null;
  return new Date(now.getTime() + days * MS_PER_DAY);
};

/** apiKeyRoleIcons maps every system role to a lucide icon for the create dialog. */
export const apiKeyRoleIcons: Record<SystemRole, LucideIcon> = {
  OWNER: ShieldCheck,
  ADMIN: ShieldCheck,
  MEMBER: User,
  VIEWER: Eye,
  NONE: Ban,
  PROJECT: FolderGit2,
  ORGANIZATION: Building2,
  SCORES_INGEST: Star,
  INGEST: Radio,
  AI_GATEWAY: Network,
};
