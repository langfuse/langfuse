import { prisma } from "../../../db";
import { type MonitorAlert } from "../types";

/** getStaleMonitorAlertReason says why an alert is stale (its monitor was deleted or has since saved a newer alert), or undefined when it is current. */
export async function getStaleMonitorAlertReason({
  projectId,
  alert,
}: {
  projectId: string;
  alert: MonitorAlert;
}): Promise<StaleMonitorAlertReason | undefined> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: alert.monitorId },
    select: { projectId: true, alertedAt: true },
  });
  if (!monitor || monitor.projectId !== projectId) return "monitor_deleted";
  // The processor publishes before it saves alertedAt, so only a later alertedAt is newer.
  if (
    alert.alertedAt &&
    monitor.alertedAt &&
    monitor.alertedAt > alert.alertedAt
  ) {
    return "newer_alert";
  }
  return undefined;
}

/** StaleMonitorAlertReason is why a queued monitor alert is dropped. */
export type StaleMonitorAlertReason = "monitor_deleted" | "newer_alert";
