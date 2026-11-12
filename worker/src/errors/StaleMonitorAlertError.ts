import { type StaleMonitorAlertReason } from "@langfuse/shared/monitors/server";

import { UnrecoverableError } from "./UnrecoverableError";

/** StaleMonitorAlertError fails a monitor-alert job without retries because its monitor was deleted or has a newer alert. */
export class StaleMonitorAlertError extends UnrecoverableError {
  constructor(readonly reason: StaleMonitorAlertReason) {
    super(`Dropped stale monitor alert: ${reason}`); // keeps name "UnrecoverableError" so BullMQ skips retries
  }
}
