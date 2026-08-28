/**
 * How a run's start time reads next to its name: relative inside the last day,
 * a calendar date beyond it — "20m ago", "5h ago", "Aug 21", "Aug 21, 2025".
 */
export const formatRunRecency = (startTime: Date, now = new Date()): string => {
  const minutes = (now.getTime() - startTime.getTime()) / 60_000;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;

  return startTime.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(startTime.getFullYear() === now.getFullYear()
      ? {}
      : { year: "numeric" }),
  });
};
