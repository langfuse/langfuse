import {
  instrumentAsync,
  logger,
  recordDistribution,
  recordGauge,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

const METRIC_PREFIX = "langfuse.periodic_runner";
type RunOutcome = "success" | "failed" | "skipped";

/**
 * Abstract base class for periodic task execution.
 *
 * Subclasses implement `execute()` and provide config via abstract getters.
 * The runner handles scheduling, error handling, and lifecycle management.
 */
export abstract class PeriodicRunner {
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeRun: { outcome: RunOutcome } | null = null;

  protected abstract get name(): string;
  protected abstract get defaultIntervalMs(): number;
  protected get initialDelayMs(): number {
    return 0;
  }
  protected abstract execute(): Promise<number | void>;

  protected constructor(
    private readonly metricName: string,
    private readonly metricScope?: string,
  ) {}

  public start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    if (!this.activeRun) {
      if (this.initialDelayMs > 0) {
        this.scheduleNext(this.initialDelayMs);
      } else {
        this.runAndScheduleNext();
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  protected markRunFailed(error: unknown): void {
    if (this.activeRun) {
      this.activeRun.outcome = "failed";
    }
    traceException(error);
  }

  protected markRunSkipped(): void {
    if (this.activeRun?.outcome === "success") {
      this.activeRun.outcome = "skipped";
    }
  }

  private async runAndScheduleNext(): Promise<void> {
    const run: { outcome: RunOutcome } = { outcome: "success" };
    this.activeRun = run;
    let nextDelayMs = this.defaultIntervalMs;
    const startedAt = Date.now();
    const metricTags = {
      runner: this.metricName,
      ...(this.metricScope ? { scope: this.metricScope } : {}),
    };

    this.emitTelemetry(() => {
      recordIncrement(`${METRIC_PREFIX}.started`, 1, metricTags);
    });

    try {
      await instrumentAsync(
        {
          name: `periodic-runner.${this.name}`,
          startNewTrace: true,
          spanKind: SpanKind.INTERNAL,
        },
        async (span) => {
          span.setAttribute("runner.name", this.name);
          span.setAttribute("runner.interval_ms", this.defaultIntervalMs);

          const result = await this.execute();
          if (typeof result === "number") {
            nextDelayMs = result;
            span.setAttribute("runner.next_delay_ms", nextDelayMs);
          }
        },
      );
    } catch (error) {
      run.outcome = "failed";
      // Errors that escape execute() are already traced by instrumentAsync.
      // Errors handled inside execute() must call markRunFailed().
      logger.error(`Unexpected error in ${this.name}`, error);
    } finally {
      const completedAt = Date.now();
      this.emitTelemetry(() => {
        const outcomeTags = { ...metricTags, outcome: run.outcome };
        recordIncrement(`${METRIC_PREFIX}.completed`, 1, outcomeTags);
        recordDistribution(
          `${METRIC_PREFIX}.duration_ms`,
          completedAt - startedAt,
          {
            ...outcomeTags,
            unit: "milliseconds",
          },
        );
        if (run.outcome === "success") {
          recordGauge(
            `${METRIC_PREFIX}.last_healthy_timestamp_seconds`,
            Math.floor(completedAt / 1000),
            {
              ...metricTags,
              unit: "seconds",
            },
          );
        }
      });
      this.activeRun = null;
      this.scheduleNext(nextDelayMs);
    }
  }

  private emitTelemetry(emit: () => void): void {
    try {
      emit();
    } catch (error) {
      logger.error(`${this.name}: Failed to emit metrics`, error);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) {
      return;
    }
    this.timeoutId = setTimeout(() => {
      this.runAndScheduleNext();
    }, delayMs);
  }
}
