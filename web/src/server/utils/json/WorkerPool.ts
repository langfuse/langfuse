import { Worker } from "worker_threads";
import path from "path";

const workerScript = path.join(__dirname, "jsonParserWorker.mjs");

interface WorkerJob {
  jsonString: string;
  resolve: (value: { data: string; workerCpuTime: number }) => void;
  reject: (reason?: any) => void;
}

class WorkerPool {
  private workers: Worker[] = [];
  private activeWorkers: Set<Worker> = new Set();
  private jobQueue: WorkerJob[] = [];
  private static instance: WorkerPool;
  private isStarted = false;
  private isShuttingDown = false;

  private constructor() {}

  public static getInstance(): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool();
    }
    return WorkerPool.instance;
  }

  public start(poolSize: number = 4) {
    if (this.isStarted) {
      console.warn("WorkerPool is already started.");
      return;
    }
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker());
    }
    this.isStarted = true;
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const terminationPromises = this.workers.map((worker) =>
      worker.terminate(),
    );
    await Promise.all(terminationPromises);
    this.workers = [];
    this.activeWorkers.clear();
    this.jobQueue = [];
    this.isStarted = false;
    this.isShuttingDown = false;
  }

  private createWorker(): Worker {
    const worker = new Worker(workerScript);

    worker.on("error", (err) => {
      console.error("Worker error:", err);
      this.activeWorkers.delete(worker);
      // Potentially replace the crashed worker
      this.workers = this.workers.filter((w) => w !== worker);
      this.workers.push(this.createWorker());
    });

    worker.on("exit", (code) => {
      if (code !== 0 && !this.isShuttingDown) {
        console.error(`Worker stopped with exit code ${code}`);
      }
      this.activeWorkers.delete(worker);
      this.workers = this.workers.filter((w) => w !== worker);
    });

    return worker;
  }

  public run(
    jsonString: string,
  ): Promise<{ data: string; workerCpuTime: number }> {
    if (!this.isStarted) {
      return Promise.reject(
        new Error("WorkerPool not started. Please call start() first."),
      );
    }
    return new Promise((resolve, reject) => {
      const job = { jsonString, resolve, reject };
      this.jobQueue.push(job);
      this.dispatch();
    });
  }

  private dispatch() {
    if (this.jobQueue.length === 0) {
      return;
    }

    const availableWorker = this.workers.find(
      (w) => !this.activeWorkers.has(w),
    );

    if (!availableWorker) {
      // All workers are busy, wait for one to become free
      return;
    }

    const job = this.jobQueue.shift();
    if (!job) {
      return;
    }

    this.activeWorkers.add(availableWorker);

    const onMessage = (message: {
      success: boolean;
      data?: string;
      error?: string;
      workerCpuTime?: number;
    }) => {
      if (message.success) {
        job.resolve({
          data: message.data!,
          workerCpuTime: message.workerCpuTime!,
        });
      } else {
        job.reject(new Error(message.error));
      }
      // Cleanup
      availableWorker.removeListener("message", onMessage);
      this.activeWorkers.delete(availableWorker);
      // Check for more jobs
      this.dispatch();
    };

    availableWorker.on("message", onMessage);

    availableWorker.postMessage(job.jsonString);
  }
}

export const jsonParserPool = WorkerPool.getInstance();
