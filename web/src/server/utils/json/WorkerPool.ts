import { Worker } from "worker_threads";
import path from "path";
import { performance } from "perf_hooks";
import fs from "fs";

// Find the worker script with multiple fallback paths
function findWorkerScript(): string {
  const possiblePaths = [
    // Development path (source files)
    path.join(__dirname, "jsonParserWorker.mjs"),
    // Production path (compiled files might be in different locations)
    path.resolve(__dirname, "jsonParserWorker.mjs"),
    // Fallback to project root
    path.join(process.cwd(), "web/src/server/utils/json/jsonParserWorker.mjs"),
    path.join(process.cwd(), "src/server/utils/json/jsonParserWorker.mjs"),
    // Next.js specific paths
    path.join(process.cwd(), ".next/server/chunks/jsonParserWorker.mjs"),
    path.join(process.cwd(), "dist/server/utils/json/jsonParserWorker.mjs"),
  ];

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      console.log("WorkerPool: Found worker script at:", possiblePath);
      return possiblePath;
    }
  }

  console.error("WorkerPool: Could not find jsonParserWorker.mjs");
  console.error("WorkerPool: Searched paths:", possiblePaths);
  console.error("WorkerPool: Current __dirname:", __dirname);
  console.error("WorkerPool: Current process.cwd():", process.cwd());
  throw new Error(
    "Could not find jsonParserWorker.mjs in any of the expected locations",
  );
}

const workerScript = findWorkerScript();

interface WorkerJob {
  message: any;
  resolve: (value: {
    data: any;
    workerCpuTime: number;
    transferTime?: number;
  }) => void;
  reject: (reason?: any) => void;
  sendTime?: number; // Track when message was sent
}
interface ParallelResult {
  results: (string | undefined)[];
  metrics: {
    mainThreadTime: number;
    totalWorkerCpuTime: number;
    avgWorkerCpuTime: number;
    maxWorkerCpuTime: number;
    coordinationOverhead: number;
    activeWorkerCount: number;
    dispatchTime: number;
    actualIdleTime: number;
    resultProcessingTime: number;
    avgTransferTime?: number;
    maxTransferTime?: number;
    totalTransferTime?: number;
  };
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
    console.log("WorkerPool: Starting with pool size:", poolSize);
    const startTime = performance.now();
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker());
    }
    this.isStarted = true;
    const endTime = performance.now();
    console.log(
      "WorkerPool: Started successfully in:",
      endTime - startTime,
      "ms",
    );
  }

  public isActive(): boolean {
    return this.isStarted;
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
      const job = {
        message: { data: jsonString, stringify: true },
        resolve,
        reject,
      };
      this.jobQueue.push(job);
      this.dispatch();
    });
  }

  public runParse(
    jsonString: string,
  ): Promise<{ data: any; workerCpuTime: number }> {
    if (!this.isStarted) {
      return Promise.reject(
        new Error("WorkerPool not started. Please call start() first."),
      );
    }
    return new Promise((resolve, reject) => {
      const job = {
        message: { data: jsonString, stringify: false },
        resolve,
        reject,
      };
      this.jobQueue.push(job);
      this.dispatch();
    });
  }

  public async runParallel(
    inputs: (string | null | undefined)[],
  ): Promise<ParallelResult> {
    if (!this.isStarted) {
      throw new Error("WorkerPool not started. Please call start() first.");
    }

    const startTime = performance.now();

    // Filter out null/undefined inputs and track their original positions
    const validInputs: { input: string; originalIndex: number }[] = [];
    inputs.forEach((input, index) => {
      if (input !== null && input !== undefined) {
        validInputs.push({ input, originalIndex: index });
      }
    });

    // Kick off all workers and measure dispatch time
    const dispatchStartTime = performance.now();
    const workerPromises = validInputs.map(({ input }) => this.run(input));
    const dispatchEndTime = performance.now();
    const dispatchTime = dispatchEndTime - dispatchStartTime;

    // Now we're in the "idle" period - main thread could do other work here
    const idleStartTime = performance.now();

    // Wait for all workers to complete
    const workerResults = await Promise.all(workerPromises);

    const idleEndTime = performance.now();
    const actualIdleTime = idleEndTime - idleStartTime;

    const mainThreadTime = performance.now() - startTime;

    // Reconstruct results array with original positions
    const results: (string | undefined)[] = new Array(inputs.length);
    validInputs.forEach(({ originalIndex }, resultIndex) => {
      results[originalIndex] = workerResults[resultIndex].data;
    });

    // Calculate metrics
    const workerTimes = workerResults.map((r) => r.workerCpuTime);
    const totalWorkerCpuTime = workerTimes.reduce((acc, time) => acc + time, 0);
    const activeWorkerCount = workerTimes.length;
    const avgWorkerCpuTime =
      activeWorkerCount > 0 ? totalWorkerCpuTime / activeWorkerCount : 0;
    const maxWorkerCpuTime =
      workerTimes.length > 0 ? Math.max(...workerTimes) : 0;
    const coordinationOverhead = Math.max(
      0,
      mainThreadTime - actualIdleTime - dispatchTime,
    );

    return {
      results,
      metrics: {
        mainThreadTime,
        totalWorkerCpuTime,
        avgWorkerCpuTime,
        maxWorkerCpuTime,
        coordinationOverhead,
        activeWorkerCount,
        dispatchTime,
        actualIdleTime,
        resultProcessingTime: 0, // No result processing for string results
      },
    };
  }

  public async runParallelParse(
    inputs: (string | null | undefined)[],
  ): Promise<{
    results: (any | undefined)[];
    metrics: ParallelResult["metrics"];
  }> {
    if (!this.isStarted) {
      throw new Error("WorkerPool not started. Please call start() first.");
    }

    const startTime = performance.now();

    // Filter out null/undefined inputs and track their original positions
    const validInputs: { input: string; originalIndex: number }[] = [];
    inputs.forEach((input, index) => {
      if (input !== null && input !== undefined) {
        validInputs.push({ input, originalIndex: index });
      }
    });

    // Measure dispatch overhead (serialization + sending to workers)
    const dispatchStartTime = performance.now();
    const workerPromises = validInputs.map(({ input }) => this.runParse(input));
    const dispatchEndTime = performance.now();
    const dispatchTime = dispatchEndTime - dispatchStartTime;

    // Now we're in the "idle" period - main thread could do other work here
    const idleStartTime = performance.now();

    // Wait for all workers to complete
    const workerResults = await Promise.all(workerPromises);

    const idleEndTime = performance.now();
    const actualIdleTime = idleEndTime - idleStartTime;

    // Measure result processing overhead (deserialization from workers)
    const resultProcessingStartTime = performance.now();

    // Reconstruct results array with original positions
    const results: (any | undefined)[] = new Array(inputs.length);
    validInputs.forEach(({ originalIndex }, resultIndex) => {
      results[originalIndex] = workerResults[resultIndex].data;
    });

    const resultProcessingEndTime = performance.now();
    const resultProcessingTime =
      resultProcessingEndTime - resultProcessingStartTime;

    const mainThreadTime = performance.now() - startTime;

    // Calculate metrics
    const workerTimes = workerResults.map((r) => r.workerCpuTime);
    const totalWorkerCpuTime = workerTimes.reduce((acc, time) => acc + time, 0);
    const activeWorkerCount = workerTimes.length;
    const avgWorkerCpuTime =
      activeWorkerCount > 0 ? totalWorkerCpuTime / activeWorkerCount : 0;
    const maxWorkerCpuTime =
      workerTimes.length > 0 ? Math.max(...workerTimes) : 0;
    const coordinationOverhead = Math.max(
      0,
      mainThreadTime - actualIdleTime - dispatchTime - resultProcessingTime,
    );

    return {
      results,
      metrics: {
        mainThreadTime,
        totalWorkerCpuTime,
        avgWorkerCpuTime,
        maxWorkerCpuTime,
        coordinationOverhead,
        activeWorkerCount,
        dispatchTime,
        actualIdleTime,
        resultProcessingTime, // New metric
      },
    };
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
      data?: any;
      error?: string;
      workerCpuTime?: number;
    }) => {
      const receiveTime = performance.now();
      const transferTime = job.sendTime
        ? receiveTime - job.sendTime
        : undefined;

      if (message.success) {
        job.resolve({
          data: message.data!,
          workerCpuTime: message.workerCpuTime!,
          transferTime,
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

    // Measure structured clone overhead when sending to worker
    const sendStartTime = performance.now();
    availableWorker.postMessage(job.message);
    const sendEndTime = performance.now();
    job.sendTime = sendEndTime; // Record when we finished sending

    const sendTime = sendEndTime - sendStartTime;

    // Log significant serialization overhead (>1ms)
    if (sendTime > 1) {
      console.log(
        `WorkerPool: Message structured clone (send) took ${sendTime.toFixed(2)}ms`,
      );
    }
  }
}

export const jsonParserPool = WorkerPool.getInstance();
