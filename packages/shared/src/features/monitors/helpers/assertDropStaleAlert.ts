import { UnrecoverableError } from "bullmq";

import { prisma } from "../../../db";
import { type MonitorAlert } from "../types";

/** assertDropStaleAlert throws a StaleAlertError when the alert's monitor was deleted or has since saved a newer alert. */
export async function assertDropStaleAlert({
  projectId,
  alert,
}: {
  projectId: string;
  alert: MonitorAlert;
}): Promise<void> {
  const reason = await staleAlertReason({ projectId, alert });
  if (reason) throw new StaleAlertError(reason);
}

/** StaleAlertError fails a monitor-alert job without retries because a newer alert or a deleted monitor superseded it. */
export class StaleAlertError extends UnrecoverableError {
  constructor(readonly reason: StaleAlertReason) {
    super(`Dropped stale monitor alert: ${reason}`);
  }
}

/** staleAlertReason says why an alert is stale, or undefined when it is current. */
async function staleAlertReason({
  projectId,
  alert,
}: {
  projectId: string;
  alert: MonitorAlert;
}): Promise<StaleAlertReason | undefined> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: alert.monitorId },
    select: { projectId: true, alertedAt: true },
  });
  if (!monitor || monitor.projectId !== projectId) return "alert_deleted";
  // The processor publishes before it saves alertedAt, so only a later alertedAt is newer.
  if (
    alert.alertedAt &&
    monitor.alertedAt &&
    monitor.alertedAt > alert.alertedAt
  ) {
    return "alert_stale";
  }
  return undefined;
}

/** StaleAlertReason is why a queued monitor alert is dropped. */
export type StaleAlertReason = "alert_deleted" | "alert_stale";
