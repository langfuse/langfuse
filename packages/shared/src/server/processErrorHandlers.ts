import { recordIncrement } from "./instrumentation";
import { logger } from "./logger";

type FatalSource = "uncaughtException" | "unhandledRejection";

export type ProcessErrorHandlerOptions = {
  /**
   * Runtime graceful drain: flip readiness to unhealthy so the load balancer
   * stops routing new traffic, let in-flight work finish, and close
   * connections. Must NOT call process.exit — this module owns the exit so it
   * can enforce the repeated-error safety gate. Omit to exit immediately with
   * no drain (for runtimes that have nothing to drain).
   */
  onFatal?: (info: { source: FatalSource; reason: unknown }) => Promise<void>;
  /**
   * Backstop: force exit if the drain never resolves (e.g. a wedged connection
   * close). Not the primary safety gate — that is the repeated-error kill.
   */
  drainTimeoutMs?: number;
  /** Injectable process exit, for tests. */
  exit?: (code: number) => void;
};

let installed = false;
let draining = false;

const DEFAULT_DRAIN_TIMEOUT_MS = 130_000;

/**
 * Install process-level handlers for unhandled rejections and uncaught
 * exceptions. Both are fatal: the first one drains in-flight requests via
 * `onFatal` and then exits non-zero so the orchestrator restarts a clean
 * process. A self-initiated shutdown never receives a follow-up SIGKILL from
 * the orchestrator, so we must exit ourselves.
 *
 * Safety gate: if a second fatal error arrives while the drain is still
 * running, the process is wedged — abandon the drain and exit immediately.
 *
 * Idempotent. Call after dd.init.
 */
export function installProcessErrorHandlers(
  options: ProcessErrorHandlerOptions = {},
): void {
  if (installed) {
    return;
  }
  installed = true;

  const exit = options.exit ?? ((code: number) => process.exit(code));
  const drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;

  const beginFatalDrain = (info: {
    source: FatalSource;
    reason: unknown;
  }): void => {
    if (draining) {
      // Safety gate: a second fatal error mid-drain means draining is not going
      // to recover the process. Stop waiting and die now.
      try {
        logger.error(
          `Repeated ${info.source} during shutdown drain; forcing immediate exit`,
          info.reason,
        );
        recordIncrement("langfuse.process.forced_exit", 1);
      } catch {
        // Never let the safety gate throw and prevent the exit.
      }
      exit(1);
      return;
    }
    draining = true;

    try {
      logger.error(
        `Fatal ${info.source}; draining in-flight requests before exit`,
        info.reason,
      );
      recordIncrement("langfuse.process.fatal_shutdown", 1);
    } catch {
      // Logging/metrics must never block the drain.
    }

    const backstop = setTimeout(() => {
      try {
        logger.error("Shutdown drain exceeded budget; forcing exit");
      } catch {
        // ignore
      }
      exit(1);
    }, drainTimeoutMs);
    if (typeof backstop.unref === "function") {
      backstop.unref();
    }

    Promise.resolve()
      .then(() => options.onFatal?.(info))
      .catch((err) => {
        try {
          logger.error("Shutdown drain failed", err);
        } catch {
          // ignore
        }
      })
      .finally(() => {
        clearTimeout(backstop);
        exit(1);
      });
  };

  process.on("unhandledRejection", function onUnhandledRejection(reason) {
    try {
      recordIncrement("langfuse.process.unhandled_rejection", 1);
    } catch {
      // ignore
    }
    beginFatalDrain({ source: "unhandledRejection", reason });
  });

  process.on("uncaughtException", function onUncaughtException(err) {
    try {
      recordIncrement("langfuse.process.uncaught_exception", 1);
    } catch {
      // ignore
    }
    beginFatalDrain({ source: "uncaughtException", reason: err });
  });
}
