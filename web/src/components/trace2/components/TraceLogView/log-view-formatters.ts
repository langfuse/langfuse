/**
 * Pure formatting utilities for LogView display.
 *
 * These functions handle presentation logic, keeping it separate from
 * data transformation and component rendering.
 */

import { type TreeNode } from "@/src/components/trace2/lib/types";

/**
 * Formats a node's display name for the log view.
 *
 * Format: "{name or type} ({first 8 chars of id})"
 * Example: "chat-completion (abc12345)"
 *
 * @param node - TreeNode to format
 * @returns Formatted display name
 */
export function formatDisplayName(node: TreeNode): string {
  const name = node.name || node.type;
  const shortId = node.id.substring(0, 8);
  return `${name} (${shortId})`;
}

/**
 * Formats milliseconds as a time string in mm:ss or mm:ss.mmm format.
 *
 * Examples (showMs = false):
 * - 0 → "0:00"
 * - 500 → "0:00"
 * - 1500 → "0:01"
 * - 65000 → "1:05"
 * - 3665000 → "61:05"
 *
 * Examples (showMs = true):
 * - 0 → "0:00.000"
 * - 500 → "0:00.500"
 * - 1500 → "0:01.500"
 * - 65123 → "1:05.123"
 *
 * @param ms - Milliseconds since trace start
 * @param showMs - Whether to display milliseconds
 * @returns Formatted time string in mm:ss or mm:ss.mmm format
 */
export function formatRelativeTime(ms: number, showMs = false): string {
  if (ms < 0) {
    return "-" + formatRelativeTime(-ms, showMs);
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  if (showMs) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats depth as a visual indicator.
 *
 * @param depth - Tree depth (0 for root observations)
 * @returns Formatted depth string or empty for depth 0
 */
export function formatDepthIndicator(depth: number): string {
  if (depth <= 0) {
    return "";
  }
  return `L${depth}`;
}

/**
 * Formats duration in milliseconds to a human-readable string.
 *
 * Examples:
 * - 0 → "0ms"
 * - 50 → "50ms"
 * - 1500 → "1.5s"
 * - 65000 → "1:05"
 *
 * @param startTime - Start time
 * @param endTime - End time (optional)
 * @returns Formatted duration string or "-" if no end time
 */
export function formatDuration(startTime: Date, endTime?: Date | null): string {
  if (!endTime) {
    return "-";
  }

  const ms = endTime.getTime() - startTime.getTime();

  if (ms < 0) {
    return "-";
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Use mm:ss format for longer durations
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
