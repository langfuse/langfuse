import { logger, instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

/**
 * Abstract base class for periodic task execution.
 *
 * Subclasses implement `execute()` and provide config via abstract getters.
 * The runner handles scheduling, error handling, and lifecycle management.
 */
export abstract class PeriodicRunner {
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  protected abstract get name(): string;
  protected abstract get defaultIntervalMs(): number;
  protected abstract execute(): Promise<number | void>;

  public start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    void this.runAndScheduleNext();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private async runAndScheduleNext(): Promise<void> {
    let nextDelayMs = this.defaultIntervalMs;

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
      // instrumentAsync already calls traceException, just log here
      logger.error(`Unexpected error in ${this.name}`, error);
    } finally {
      this.scheduleNext(nextDelayMs);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isRunning) {
      return;
    }
    this.timeoutId = setTimeout(() => {
      void this.runAndScheduleNext();
    }, delayMs);
  }
}
