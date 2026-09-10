import { Worker } from "worker_threads";
import { Model } from "@langfuse/shared";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import path from "path";
import { env } from "../../env";

interface TokenCountWorkerPool {
  workers: Worker[];
  currentWorkerIndex: number;
  pendingRequests: Map<
    string,
    {
      resolve: (value: number | undefined) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >;
}

export class TokenCountWorkerManager {
  private pool: TokenCountWorkerPool;
  private readonly workerPath: string;
  private readonly poolSize: number;
  private requestCounter = 0;
  private isShuttingDown = false;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
    // Use compiled JavaScript file
    this.workerPath = path.join(__dirname, "worker-thread.js");
    this.pool = {
      workers: [],
      currentWorkerIndex: 0,
      pendingRequests: new Map(),
    };
    this.initializeWorkers();
  }

  private initializeWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      this.createWorker();
    }
  }

  private createWorker() {
    const worker = this.createWorkerWithListeners();
    this.pool.workers.push(worker);
  }

  private createWorkerWithListeners(): Worker {
    const worker = new Worker(this.workerPath);

    worker.on(
      "message",
      (data: {
        id: string;
        result: number | undefined;
        error: string | null;
      }) => {
        const request = this.pool.pendingRequests.get(data.id);
        if (request) {
          clearTimeout(request.timeout);
          this.pool.pendingRequests.delete(data.id);

          if (data.error) {
            request.reject(new Error(data.error));
          } else {
            request.resolve(data.result);
          }
        }
      },
    );

    worker.on("error", (error) => {
      // Terminating workers surface as errors/non-zero exits; don't respawn
      // into a pool we are tearing down.
      if (this.isShuttingDown) return;
      logger.error("Worker thread error:", error);
      this.replaceWorker(worker);
    });

    worker.on("exit", (code) => {
      if (this.isShuttingDown) return;
      if (code !== 0) {
        logger.error(`Worker stopped with exit code ${code}`);
        this.replaceWorker(worker);
      }
    });

    return worker;
  }

  private cleanupPendingRequests() {
    // Reject all pending requests to provide faster error feedback
    for (const [, request] of this.pool.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Worker failed and is being replaced"));
    }
    this.pool.pendingRequests.clear();
  }

  private replaceWorker(deadWorker: Worker) {
    const index = this.pool.workers.indexOf(deadWorker);
    if (index !== -1) {
      // Clean up any pending requests for the dead worker
      this.cleanupPendingRequests();

      // Create a new worker with proper event listeners
      this.pool.workers[index] = this.createWorkerWithListeners();
    }
  }

  private getNextWorker(): Worker | undefined {
    if (this.pool.workers.length === 0) {
      return undefined;
    }
    const worker = this.pool.workers[this.pool.currentWorkerIndex];
    this.pool.currentWorkerIndex =
      (this.pool.currentWorkerIndex + 1) % this.poolSize;
    return worker;
  }

  async tokenCount(
    params: { model: Model; text: unknown },
    timeoutMs = 30000,
  ): Promise<number | undefined> {
    // A SIGTERM teardown terminates the pool while ingestion may still call
    // in. Drop the count (undefined = usage unknown, which the caller commits
    // as absent rather than as a zero) instead of posting to a terminating or
    // already-gone worker, which threw and was logged per observation as a
    // tokenization failure — the spike seen on rollouts.
    if (this.isShuttingDown) {
      return undefined;
    }

    return new Promise((resolve, reject) => {
      const id = `token-count-${++this.requestCounter}-${Date.now()}`;
      const worker = this.getNextWorker();

      if (!worker) {
        resolve(undefined);
        return;
      }

      const timeout = setTimeout(() => {
        this.pool.pendingRequests.delete(id);
        reject(
          new Error(`Token count operation timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.pool.pendingRequests.set(id, { resolve, reject, timeout });

      // Serialize the data to ensure no complex objects like Decimal are passed
      const serializedParams = {
        model: JSON.parse(JSON.stringify(params.model)),
        text: params.text,
        id,
      };

      worker.postMessage(serializedParams);
    });
  }

  async terminate() {
    // Set before touching the pool so concurrent tokenCount() calls and the
    // workers' own exit/error events see the shutdown and stop early.
    this.isShuttingDown = true;

    // In-flight requests can no longer get a response from the terminating
    // workers. Resolve them with undefined (usage unknown) rather than
    // rejecting: dropping counts during shutdown is expected, not an error,
    // and a rejection is logged per request by the caller as a tokenization
    // failure. Emit one summary metric instead so the drops stay observable
    // without the per-request log spam that spiked on rollouts.
    const droppedOnShutdown = this.pool.pendingRequests.size;
    if (droppedOnShutdown > 0) {
      recordIncrement(
        "langfuse.tokenisation.skipped_on_shutdown",
        droppedOnShutdown,
      );
      logger.info(
        `Dropped ${droppedOnShutdown} in-flight token-count request(s) on shutdown.`,
      );
    }
    for (const [, request] of this.pool.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.resolve(undefined);
    }
    this.pool.pendingRequests.clear();

    await Promise.all(this.pool.workers.map((worker) => worker.terminate()));
    this.pool.workers = [];
  }
}

// Singleton instance
let workerManager: TokenCountWorkerManager | null = null;

export function getTokenCountWorkerManager(
  poolSize?: number,
): TokenCountWorkerManager {
  if (!workerManager) {
    workerManager = new TokenCountWorkerManager(
      poolSize ?? env.LANGFUSE_TOKEN_COUNT_WORKER_POOL_SIZE,
    );
  }
  return workerManager;
}

export async function tokenCountAsync(
  params: {
    model: Model;
    text: unknown;
  },
  timeoutMs?: number,
): Promise<number | undefined> {
  const manager = getTokenCountWorkerManager();
  return manager.tokenCount(params, timeoutMs);
}
