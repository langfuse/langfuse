import { format, formatDistanceToNowStrict } from "date-fns";

export const formatDashboardModified = (
  updatedAt: Date,
  createdAt: Date,
): { updatedRelative: string; createdAbsolute: string } => ({
  updatedRelative: formatDistanceToNowStrict(updatedAt, { addSuffix: true }),
  createdAbsolute: `Created ${format(createdAt, "MMM d, yyyy")}`,
});
