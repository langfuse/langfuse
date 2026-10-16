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

/** roleIcons maps every system role to a lucide icon for role pickers and permission popups. */
export const roleIcons: Record<SystemRole, LucideIcon> = {
  OWNER: ShieldCheck,
  ADMIN: ShieldCheck,
  MEMBER: User,
  VIEWER: Eye,
  NONE: Ban,
  LEGACY_PROJECT_API_KEY: FolderGit2,
  LEGACY_ORGANIZATION_API_KEY: Building2,
  SCORES_INGEST: Star,
  INGEST: Radio,
  AI_GATEWAY: Network,
};
